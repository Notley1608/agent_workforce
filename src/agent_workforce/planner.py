"""Objective -> plan: asks a model to propose a multi-agent pipeline for a stated goal.

Phase 1 of the autonomy loop (goal -> plan -> human approval -> execution).
The plan is just a pipeline definition (agents + sequence) expressed as JSON;
approval creates real agent/workflow rows and hands off to the existing
workflow engine (routes/workflows.py) to run it, so this module only adds the
"propose" step rather than a second execution path.
"""

import json
import re

from . import db
from .providers import run_model

PLANNER_PROVIDER = "groq"
PLANNER_MODEL = "openai/gpt-oss-120b"

# Groq is the only provider this app runs agents on, so the planner LLM isn't
# asked to pick a provider/model - it can only ever hallucinate one wrong.
# Model is instead derived here from capabilities: Groq's web search isn't a
# tools= flag, it's baked into the "compound" system model specifically (see
# providers._run_groq), so a step that needs "web" gets that model, else the
# plain chat default.
GROQ_DEFAULT_MODEL = "openai/gpt-oss-120b"
GROQ_WEB_MODEL = "groq/compound"

SYSTEM_PROMPT = """You are the planning layer for an AI agent workforce app called Crew.
Given a user's objective, propose a plan: a short sequence of AI agents that run one \
after another, each agent's output feeding into the next agent's input as its task.

Respond with ONLY a JSON object, no markdown fences, no commentary, matching this shape:
{{
  "summary": "one paragraph explaining what you intend to do and why",
  "steps": [
    {{
      "name": "short agent name, e.g. 'Competitor Researcher'",
      "role": "Researcher, Engineer, Writer, or Analyst",
      "capabilities": ["web"],
      "instructions": "the system prompt this agent should run with"
    }}
  ]
}}

Capabilities available in this workspace: {capabilities}
Only request a capability a step genuinely needs. Keep the plan as short as
the objective allows - do not add steps that aren't necessary. "files"
(writing output to disk) and "terminal" (running a shell command) are risky
capabilities - a human must approve each use of one before it actually fires,
so mention that in your summary if a step requests either. For a "terminal"
step, the agent's instructions should make it output ONLY the exact shell
command to run, nothing else.
"""


def _capability_summary(conn) -> str:
    rows = conn.execute("SELECT key, enabled FROM infrastructure").fetchall()
    if not rows:
        return "(none configured)"
    return ", ".join(f"{r['key']} ({'enabled' if r['enabled'] else 'disabled'})" for r in rows)


def _extract_json(text: str) -> dict:
    # ponytail: models sometimes wrap JSON in ```json fences despite being told
    # not to; strip fences rather than fighting the prompt further.
    cleaned = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    return json.loads(cleaned)


def propose_plan(conn, objective: str) -> dict:
    system = SYSTEM_PROMPT.format(capabilities=_capability_summary(conn))
    result = run_model(PLANNER_PROVIDER, PLANNER_MODEL, system, objective, set())
    try:
        plan = _extract_json(result.text)
        steps = plan["steps"]
        if not steps:
            raise ValueError("plan had no steps")
    except (json.JSONDecodeError, KeyError, ValueError) as exc:
        raise ValueError(f"planner returned an unusable plan: {exc}") from exc

    enabled = {r["key"] for r in conn.execute("SELECT key FROM infrastructure WHERE enabled = 1")}
    warnings = []
    for step in steps:
        step.setdefault("capabilities", [])
        step.setdefault("instructions", "")
        step["provider"] = "groq"
        step["model"] = GROQ_WEB_MODEL if "web" in step["capabilities"] else GROQ_DEFAULT_MODEL
        for cap in step["capabilities"]:
            if cap not in enabled:
                warnings.append(f"step '{step.get('name', step['role'])}' needs '{cap}', which isn't enabled yet")

    return {"summary": plan.get("summary", ""), "steps": steps, "warnings": warnings}


# Phase 3: mid-run recovery. When a workflow step fails, decide what to do
# instead of just killing the run - this is the "observe -> decide -> recover"
# half of the loop. Judging whether a *successful* step's output is
# unexpected is a fuzzier problem and stays out of scope for now.
MAX_STEP_RETRIES = 1

RECOVERY_SYSTEM_PROMPT = """A step in an autonomous multi-agent pipeline just failed. Decide how to proceed.

Respond with ONLY a JSON object, no markdown fences, no commentary:
{{"action": "retry" | "skip" | "abort", "reason": "one sentence"}}

- "retry": the failure looks transient (rate limit, timeout, temporary API error) - the same instructions should work if tried again.
- "skip": the step isn't essential to the objective - continue the pipeline without its output.
- "abort": the failure is unrecoverable (bad model id, invalid request, missing capability) or the step is essential and can't be skipped.

Objective: {objective}
Step role: {role}
Error: {error}
"""


def decide_recovery(objective: str, role: str, error: str) -> dict:
    system = RECOVERY_SYSTEM_PROMPT.format(objective=objective, role=role, error=error)
    try:
        result = run_model(PLANNER_PROVIDER, PLANNER_MODEL, system, "Decide.", set())
        decision = _extract_json(result.text)
        if decision.get("action") not in ("retry", "skip", "abort"):
            raise ValueError(f"invalid action: {decision.get('action')!r}")
    except Exception:
        return {"action": "abort", "reason": "recovery planner could not decide"}
    decision.setdefault("reason", "")
    return decision


AGENT_PROPOSAL_PROMPT = """You are the Orchestrator of an autonomous AI workforce called Crew, drafting a new \
agent to hire for the owner to review and approve.

Respond with ONLY a JSON object, no markdown fences, no commentary:
{{"name": "short agent name", "role": "Researcher, Engineer, Writer, or Analyst", "instructions": "the system prompt this agent should run with"}}

Capabilities available in this workspace: {capabilities}
Brief: {brief}
"""


def propose_agent(conn, brief: str) -> dict:
    """The Agent Builder: the Orchestrator drafts a role/instructions for a
    brief, but nothing is created until the owner approves it (POST /api/agents) -
    mirrors propose_plan's propose -> approve split, scoped to a single agent."""
    system = AGENT_PROPOSAL_PROMPT.format(capabilities=_capability_summary(conn), brief=brief)
    result = run_model(PLANNER_PROVIDER, PLANNER_MODEL, system, brief, set())
    try:
        draft = _extract_json(result.text)
        if not draft.get("name") or not draft.get("role"):
            raise ValueError("proposal is missing a name or role")
    except (json.JSONDecodeError, ValueError) as exc:
        raise ValueError(f"orchestrator returned an unusable agent proposal: {exc}") from exc

    draft.setdefault("instructions", "")
    role_type = infer_role_type(draft["role"])
    draft["role_type"] = role_type
    draft["capabilities_override"] = default_capabilities_for_role_type(role_type)
    return draft


def infer_role_type(role_text: str) -> str:
    """Researcher/Worker split: everything the planner can call a step is one
    or the other. "Researcher" is the only word that means research - an
    Engineer/Writer/Analyst step does work, it doesn't just investigate."""
    return "researcher" if "research" in role_text.lower() else "worker"


def default_capabilities_for_role_type(role_type: str) -> list[str] | None:
    """None means "inherit whatever's globally enabled" (workers do the risky
    work). Researchers default to web-only so a prose/analysis agent can't
    accidentally have its output written to disk or shelled out."""
    return ["web"] if role_type == "researcher" else None


def create_agents_and_workflow(conn, objective: str, steps: list[dict]) -> tuple[str, list[str]]:
    """Turns an approved plan into real rows: one agent per step, one workflow chaining them."""
    agent_ids = []
    for step in steps:
        agent_id = db.new_id()
        role_type = infer_role_type(step["role"])
        capabilities_override = default_capabilities_for_role_type(role_type)
        conn.execute(
            """INSERT INTO agents
               (id, name, role, role_type, capabilities_override, avatar, provider, model,
                instructions, desk_x, desk_y, status, created_at)
               VALUES (?, ?, ?, ?, ?, '🤖', ?, ?, ?, 0, 0, 'idle', ?)""",
            (
                agent_id,
                step.get("name") or step["role"],
                step["role"],
                role_type,
                json.dumps(capabilities_override) if capabilities_override is not None else None,
                step["provider"],
                step["model"],
                step["instructions"],
                db.now(),
            ),
        )
        agent_ids.append(agent_id)

    workflow_id = db.new_id()
    conn.execute(
        "INSERT INTO workflows (id, name, agent_ids, created_at) VALUES (?, ?, ?, ?)",
        (workflow_id, objective[:80], json.dumps(agent_ids), db.now()),
    )
    return workflow_id, agent_ids
