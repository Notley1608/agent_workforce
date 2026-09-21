"""Opportunities + ledger: the Orchestrator's persistent view of what's worth
pursuing and whether the workforce can currently afford to pursue it.

An opportunity is a long-lived object (unlike a plan, which is a one-shot
proposal) that tracks a business idea from discovery through to a measured
outcome. The ledger is the real money record backing "recovery mode" -
whether the workforce is currently allowed to start new work.
"""

import json
import re

from . import db
from .providers import run_model

# Lifecycle is a label, not an enforced state machine: backward transitions
# (e.g. success -> researching, to try again) are allowed, so this is only
# used to validate the value is one of the known stages.
STATUSES = [
    "discovered", "researching", "validating", "refined", "awaiting_approval",
    "approved", "queued", "assigned", "executing", "paused",
    "success", "failure", "measuring_outcome", "learned",
]

DISCOVER_SYSTEM_PROMPT = """You are the Orchestrator of an autonomous AI workforce called Crew. \
Propose new business opportunities worth pursuing given the workforce's current financial state.

Respond with ONLY a JSON object, no markdown fences, no commentary:
{{"opportunities": [{{"title": "short name", "description": "what it is and how it could make money", "forecast_value": 1200.0}}]}}

Current ledger balance: ${balance:.2f}
Existing opportunities already tracked: {existing}
Lessons from past opportunities: {lessons}
{hint_line}
Propose 1-3 new, distinct opportunities. forecast_value is a rough USD estimate of value if pursued, or null if unknown.
"""


class WorkforceBlockedError(Exception):
    """Raised when new work is requested while an Operating Mode (Recovery,
    Emergency Stop) is blocking it - see ensure_can_start_work."""


# ponytail: fixed headcount to start, not a settings-table value - turn this
# into a configurable setting (like daily_spend_limit) if the owner wants to
# tune it live instead of editing code.
MAX_AGENTS_BY_ROLE_TYPE = {"researcher": 5, "worker": 5, "business": 3}


def ensure_can_recruit_agent(conn, role_type: str) -> None:
    """The owner manually recruiting an agent (POST /api/agents) is the only
    way one is ever created - missions reuse the existing roster instead (see
    planner.assign_agents_and_workflow) - so this is the one real gate on
    headcount. Every agent is a standing option to spend tokens/money on
    schedule or on a whim, so each role_type is capped independently rather
    than growing without limit."""
    cap = MAX_AGENTS_BY_ROLE_TYPE.get(role_type, MAX_AGENTS_BY_ROLE_TYPE["worker"])
    current = conn.execute(
        "SELECT COUNT(*) AS n FROM agents WHERE role_type = ?", (role_type,)
    ).fetchone()["n"]
    if current >= cap:
        raise WorkforceBlockedError(
            f"{role_type} cap reached ({cap}); retire an existing {role_type} before recruiting another"
        )


def business_economics(conn, opportunity_id: str) -> dict:
    """A business's own P&L, scoped to its ledger entries - the number a
    Business Agent reasons about instead of the workspace-wide balance()."""
    row = conn.execute(
        """SELECT COALESCE(SUM(CASE WHEN kind = 'revenue' THEN amount ELSE 0 END), 0) AS revenue,
                  COALESCE(SUM(CASE WHEN kind = 'cost' THEN amount ELSE 0 END), 0) AS cost
           FROM ledger WHERE opportunity_id = ?""",
        (opportunity_id,),
    ).fetchone()
    return {"revenue": row["revenue"], "cost": row["cost"], "profit": row["revenue"] - row["cost"]}


def balance(conn) -> float:
    row = conn.execute(
        "SELECT COALESCE(SUM(CASE WHEN kind = 'cost' THEN -amount ELSE amount END), 0) AS bal FROM ledger"
    ).fetchone()
    return row["bal"]


def get_recovery_threshold(conn) -> float | None:
    row = conn.execute("SELECT value FROM settings WHERE key = 'recovery_threshold'").fetchone()
    return float(row["value"]) if row and row["value"] else None


def is_recovery_mode(conn) -> bool:
    # No threshold set (the default) means the owner hasn't opted into this
    # policy yet - a brand new workspace starts at $0 and its very first job
    # has a real, nonzero cost, so gating on "balance < 0" out of the box
    # would block all work forever. Set a threshold (e.g. -50) once there's
    # real capital/revenue to protect.
    threshold = get_recovery_threshold(conn)
    return threshold is not None and balance(conn) < threshold


def is_emergency_stopped(conn) -> bool:
    row = conn.execute("SELECT value FROM settings WHERE key = 'emergency_stop'").fetchone()
    return bool(row and row["value"] == "1")


def operating_mode(conn) -> str:
    """The owner-facing label for the workforce's current state."""
    if is_emergency_stopped(conn):
        return "emergency_stop"
    if is_recovery_mode(conn):
        return "recovery"
    return "running"


def ensure_can_start_work(conn) -> None:
    """The one gate every new-work entry point (single tasks, workflow runs,
    automations) calls before starting anything."""
    if is_emergency_stopped(conn):
        raise WorkforceBlockedError("emergency stop is active; new work is blocked until it's lifted")
    if is_recovery_mode(conn):
        raise WorkforceBlockedError("ledger balance is below the recovery threshold; new work is blocked until it recovers")


def record_ledger(conn, kind: str, amount: float, opportunity_id: str | None = None,
                   job_id: str | None = None, note: str = "") -> None:
    conn.execute(
        """INSERT INTO ledger (id, kind, amount, opportunity_id, job_id, note, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (db.new_id(), kind, amount, opportunity_id, job_id, note, db.now()),
    )


def create_opportunity(conn, title: str, description: str = "", forecast_value: float | None = None) -> str:
    opportunity_id = db.new_id()
    conn.execute(
        """INSERT INTO opportunities (id, title, description, status, forecast_value, created_at, updated_at)
           VALUES (?, ?, ?, 'discovered', ?, ?, ?)""",
        (opportunity_id, title, description, forecast_value, db.now(), db.now()),
    )
    return opportunity_id


def set_status(conn, opportunity_id: str, status: str) -> None:
    if status not in STATUSES:
        raise ValueError(f"unknown opportunity status: {status!r}")
    conn.execute(
        "UPDATE opportunities SET status = ?, updated_at = ? WHERE id = ?",
        (status, db.now(), opportunity_id),
    )


def attach_workflow(conn, opportunity_id: str, workflow_id: str) -> None:
    conn.execute(
        "UPDATE opportunities SET workflow_id = ?, status = 'executing', updated_at = ? WHERE id = ?",
        (workflow_id, db.now(), opportunity_id),
    )


def opportunity_id_for_workflow(conn, workflow_id: str) -> str | None:
    row = conn.execute("SELECT id FROM opportunities WHERE workflow_id = ?", (workflow_id,)).fetchone()
    return row["id"] if row else None


def opportunity_id_for_workflow_run(conn, run_id: str) -> str | None:
    run = conn.execute("SELECT workflow_id FROM workflow_runs WHERE id = ?", (run_id,)).fetchone()
    return opportunity_id_for_workflow(conn, run["workflow_id"]) if run else None


def record_learning(conn, opportunity_id: str, note: str) -> None:
    """Owner's reflection on a finished opportunity - the actual organizational
    learning loop: real past outcomes feed into future discover_opportunities
    calls (see the 'lessons' line built below), instead of the Orchestrator
    proposing ideas in a vacuum every time."""
    row = conn.execute("SELECT status FROM opportunities WHERE id = ?", (opportunity_id,)).fetchone()
    if row is None:
        raise ValueError("opportunity not found")
    next_status = "learned" if row["status"] in ("success", "failure") else row["status"]
    conn.execute(
        "UPDATE opportunities SET notes = ?, status = ?, updated_at = ? WHERE id = ?",
        (note, next_status, db.now(), opportunity_id),
    )


def mark_outcome_for_workflow(conn, workflow_id: str, outcome: str) -> None:
    """outcome is 'success' or 'failure' - called when a workflow run tied to
    an opportunity finishes, so the opportunity's status reflects what actually happened."""
    opportunity_id = opportunity_id_for_workflow(conn, workflow_id)
    if opportunity_id:
        set_status(conn, opportunity_id, outcome)


def _extract_json(text: str) -> dict:
    cleaned = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    return json.loads(cleaned)


def discover_opportunities(conn, hint: str = "") -> list[dict]:
    """Orchestrator call: proposes new opportunities given the current ledger
    balance and what's already tracked, and persists them as 'discovered'."""
    existing = ", ".join(r["title"] for r in conn.execute("SELECT title FROM opportunities")) or "(none yet)"
    learned = conn.execute(
        "SELECT title, status, notes FROM opportunities WHERE notes IS NOT NULL AND notes != ''"
    ).fetchall()
    lessons = "; ".join(f"{r['title']} ({r['status']}): {r['notes']}" for r in learned) or "(none yet)"
    system = DISCOVER_SYSTEM_PROMPT.format(
        balance=balance(conn),
        existing=existing,
        lessons=lessons,
        hint_line=f"Focus area: {hint}" if hint else "",
    )
    result = run_model("groq", "openai/gpt-oss-120b", system, "Propose opportunities.", set())
    try:
        parsed = _extract_json(result.text)
        ideas = parsed["opportunities"]
        if not ideas:
            raise ValueError("orchestrator proposed no opportunities")
    except (json.JSONDecodeError, KeyError, ValueError) as exc:
        raise ValueError(f"orchestrator returned unusable opportunities: {exc}") from exc

    created = [
        create_opportunity(conn, idea.get("title", "Untitled"), idea.get("description", ""), idea.get("forecast_value"))
        for idea in ideas
    ]
    conn.commit()
    placeholders = ",".join("?" * len(created))
    rows = conn.execute(f"SELECT * FROM opportunities WHERE id IN ({placeholders})", created).fetchall()
    return [dict(r) for r in rows]


ASK_SYSTEM_PROMPT = """You are the Orchestrator of an autonomous AI workforce called Crew, talking \
directly with the owner. Answer their question plainly, in a few sentences - no JSON, no markdown fences.

Current state:
- Operating mode: {mode}
- Ledger balance: ${balance:.2f}
- Opportunities: {opportunities}
- Agents on the floor: {agents}
"""


def ask_orchestrator(conn, question: str) -> str:
    """Free-form Q&A with the real workspace state as context - the
    conversational counterpart to the structured discover_opportunities call."""
    opps = ", ".join(f"{r['title']} ({r['status']})" for r in conn.execute("SELECT title, status FROM opportunities")) or "(none yet)"
    agent_rows = conn.execute("SELECT name, role, role_type FROM agents").fetchall()
    agents = ", ".join(f"{r['name']} ({r['role_type']})" for r in agent_rows) or "(none hired yet)"
    system = ASK_SYSTEM_PROMPT.format(mode=operating_mode(conn), balance=balance(conn), opportunities=opps, agents=agents)
    result = run_model("groq", "openai/gpt-oss-120b", system, question, set())

    conn.execute(
        "INSERT INTO orchestrator_messages (id, role, content, created_at) VALUES (?, 'owner', ?, ?)",
        (db.new_id(), question, db.now()),
    )
    conn.execute(
        "INSERT INTO orchestrator_messages (id, role, content, created_at) VALUES (?, 'orchestrator', ?, ?)",
        (db.new_id(), result.text, db.now()),
    )
    conn.commit()
    return result.text
