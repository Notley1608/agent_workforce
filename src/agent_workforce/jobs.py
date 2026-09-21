"""Job execution: runs model calls off the event loop thread, chains workflow steps.

Shared by the agents and workflows routers (and by the automation scheduler
via `_start_workflow_run` in routes/workflows.py), so it lives on its own
rather than inside either router.
"""

import json
import subprocess
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from pathlib import Path

from . import db, opportunities, planner
from .pricing import estimate_cost
from .providers import run_model

# Risk gating: capabilities with an effect outside the app (writing to disk,
# running shell commands, eventually sending mail) pause for a human's OK
# before firing, instead of running unattended like a plain model call.
OUTPUT_DIR = Path.home() / ".agent_workforce" / "outputs"
TERMINAL_WORKDIR = Path.home() / ".agent_workforce" / "workspace"
MAX_TERMINAL_SECONDS = 30


def write_output_file(job_id: str, text: str) -> str:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUTPUT_DIR / f"{job_id}.txt"
    path.write_text(text)
    return str(path)


def _write_file_action(job_id: str, text: str) -> tuple[str, str]:
    path = write_output_file(job_id, text)
    return text, f"wrote {path}"


def _run_terminal_action(job_id: str, command: str) -> tuple[str, str]:
    # ponytail: sandboxed by cwd only, not a real container/jail - the human
    # approval step reading the exact command before it runs IS the safety
    # net here (same model Claude Code itself uses). Tighten with a real
    # sandbox (docker/firejail) if this app ever runs multi-user.
    TERMINAL_WORKDIR.mkdir(parents=True, exist_ok=True)
    try:
        result = subprocess.run(
            command, shell=True, cwd=TERMINAL_WORKDIR, capture_output=True, text=True, timeout=MAX_TERMINAL_SECONDS
        )
        output = (result.stdout + result.stderr).strip()
        return output, f"ran command (exit {result.returncode}): {command}"
    except subprocess.TimeoutExpired:
        return f"[command timed out after {MAX_TERMINAL_SECONDS}s]", f"command timed out: {command}"


# Each risky capability maps to the (job_id, text) -> (new_text, event_label)
# action that fires once a human approves it.
RISKY_ACTIONS = {
    "files": _write_file_action,
    "terminal": _run_terminal_action,
}
RISKY_CAPABILITIES = set(RISKY_ACTIONS)


def apply_risky_actions(job_id: str, capabilities: list[str], text: str) -> tuple[str, list[str]]:
    labels = []
    for cap in capabilities:
        text, label = RISKY_ACTIONS[cap](job_id, text)
        labels.append(label)
    return text, labels

# ponytail: fixed-size pool caps concurrent model calls workspace-wide.
# Bump max_workers (or make it per-agent) if desk count regularly exceeds it.
EXECUTOR = ThreadPoolExecutor(max_workers=8, thread_name_prefix="job")

# Bounded autonomy: no single job may run longer than this. The nested call
# thread is left to finish in the background if it times out (Python can't
# kill a thread), but the job is marked failed so nothing hangs silently.
MAX_JOB_SECONDS = 120
_TIMEOUT_EXECUTOR = ThreadPoolExecutor(max_workers=8, thread_name_prefix="job-timeout")


def job_row_to_dict(row) -> dict:
    d = dict(row)
    d["tools_used"] = json.loads(d["tools_used"]) if d["tools_used"] else []
    return d


def insert_job(conn, agent_id: str, input_text: str, workflow_run_id=None, step_index=None) -> str:
    job_id = db.new_id()
    conn.execute(
        """INSERT INTO jobs (id, agent_id, input, status, workflow_run_id, step_index, created_at)
           VALUES (?, ?, ?, 'pending', ?, ?, ?)""",
        (job_id, agent_id, input_text, workflow_run_id, step_index, db.now()),
    )
    return job_id


def _enabled_capabilities_for(conn, agent) -> set[str]:
    rows = conn.execute("SELECT key FROM infrastructure WHERE enabled = 1").fetchall()
    enabled = {r["key"] for r in rows}
    # Per-agent overrides only ever narrow the global set (a researcher can't
    # grant itself "terminal" just because it's globally on) - see
    # planner.default_capabilities_for_role_type.
    override = agent["capabilities_override"]
    return enabled & set(json.loads(override)) if override else enabled


def record_event(conn, job_id: str, label: str) -> None:
    conn.execute(
        "INSERT INTO job_events (id, job_id, label, created_at) VALUES (?, ?, ?, ?)",
        (db.new_id(), job_id, label, db.now()),
    )


def execute_job(job_id: str, agent_id: str) -> None:
    """Runs off the event loop thread; does the real model call."""
    conn = db.get_conn()
    conn.execute(
        "UPDATE jobs SET status = 'running', started_at = ? WHERE id = ?",
        (db.now(), job_id),
    )
    conn.execute("UPDATE agents SET status = 'working' WHERE id = ?", (agent_id,))
    record_event(conn, job_id, "Started")
    conn.commit()

    agent = conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
    job = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    capabilities = _enabled_capabilities_for(conn, agent)

    try:
        record_event(conn, job_id, f"Calling {agent['provider']}/{agent['model']}")
        conn.commit()
        future = _TIMEOUT_EXECUTOR.submit(
            run_model, agent["provider"], agent["model"], agent["instructions"], job["input"], capabilities
        )
        try:
            result = future.result(timeout=MAX_JOB_SECONDS)
        except FutureTimeoutError:
            raise TimeoutError(f"exceeded {MAX_JOB_SECONDS}s execution limit")
        cost = estimate_cost(agent["model"], result.input_tokens, result.output_tokens)
        risky = capabilities & RISKY_CAPABILITIES
        status = "awaiting_approval" if risky else "completed"
        # Guard against a job the user cancelled while the model call was still
        # in flight (we can't kill the thread, only ignore its result).
        cur = conn.execute(
            """UPDATE jobs SET status = ?, output = ?, input_tokens = ?,
               output_tokens = ?, tools_used = ?, cost = ?, completed_at = ?, risky_capabilities = ?
               WHERE id = ? AND status = 'running'""",
            (
                status,
                result.text,
                result.input_tokens,
                result.output_tokens,
                json.dumps(result.tools_used),
                cost,
                None if risky else db.now(),
                json.dumps(sorted(risky)) if risky else None,
                job_id,
            ),
        )
        if cur.rowcount:
            if cost:
                opp_id = (
                    opportunities.opportunity_id_for_workflow_run(conn, job["workflow_run_id"])
                    if job["workflow_run_id"] is not None
                    else None
                )
                opportunities.record_ledger(conn, "cost", cost, opportunity_id=opp_id, job_id=job_id,
                                             note=f"{agent['name']} ({agent['model']})")
            for tool in result.tools_used:
                record_event(conn, job_id, f"Used tool: {tool}")
            if risky:
                record_event(conn, job_id, f"Awaiting approval to use: {', '.join(sorted(risky))}")
                conn.commit()
            else:
                record_event(conn, job_id, "Completed")
                conn.commit()
                if job["workflow_run_id"] is not None:
                    _advance_workflow(conn, job["workflow_run_id"], job["step_index"], result.text)
        else:
            record_event(conn, job_id, "Discarded result (job was cancelled)")
            conn.commit()
    except Exception as exc:
        cur = conn.execute(
            "UPDATE jobs SET status = 'failed', error = ?, completed_at = ? WHERE id = ? AND status = 'running'",
            (str(exc), db.now(), job_id),
        )
        if cur.rowcount:
            record_event(conn, job_id, f"Failed: {exc}")
            conn.commit()
            if job["workflow_run_id"] is not None:
                _handle_step_failure(conn, job, agent, str(exc))
        else:
            record_event(conn, job_id, "Discarded failure (job was cancelled)")
            conn.commit()
    finally:
        conn.execute("UPDATE agents SET status = 'idle' WHERE id = ?", (agent_id,))
        conn.commit()
        conn.close()


def _advance_workflow(conn, run_id: str, step_index: int, step_output: str) -> None:
    """Feeds a completed step's output into the next step, or closes out the run."""
    run = conn.execute("SELECT * FROM workflow_runs WHERE id = ?", (run_id,)).fetchone()
    workflow = conn.execute("SELECT * FROM workflows WHERE id = ?", (run["workflow_id"],)).fetchone()
    agent_ids = json.loads(workflow["agent_ids"])
    next_index = step_index + 1

    if next_index >= len(agent_ids):
        conn.execute(
            "UPDATE workflow_runs SET status = 'completed', completed_at = ? WHERE id = ?",
            (db.now(), run_id),
        )
        opportunities.mark_outcome_for_workflow(conn, run["workflow_id"], "success")
        conn.commit()
        return

    next_agent_id = agent_ids[next_index]
    next_job_id = insert_job(conn, next_agent_id, step_output, run_id, next_index)
    conn.commit()
    EXECUTOR.submit(execute_job, next_job_id, next_agent_id)


def _handle_step_failure(conn, job, agent, error: str) -> None:
    """Observe -> decide -> recover: asks the planner what to do about a failed
    step instead of always killing the run. Capped at MAX_STEP_RETRIES so a
    persistently failing step can't retry forever."""
    run_id = job["workflow_run_id"]
    step_index = job["step_index"]
    run = conn.execute("SELECT * FROM workflow_runs WHERE id = ?", (run_id,)).fetchone()
    prior_failures = conn.execute(
        "SELECT COUNT(*) AS n FROM jobs WHERE workflow_run_id = ? AND step_index = ? AND status = 'failed'",
        (run_id, step_index),
    ).fetchone()["n"]

    if prior_failures <= planner.MAX_STEP_RETRIES:
        decision = planner.decide_recovery(run["input"], agent["role"], error)
    else:
        decision = {"action": "abort", "reason": f"already retried {planner.MAX_STEP_RETRIES} time(s)"}

    record_event(conn, job["id"], f"Recovery: {decision['action']} ({decision['reason']})")
    conn.commit()

    if decision["action"] == "retry":
        retry_job_id = insert_job(conn, job["agent_id"], job["input"], run_id, step_index)
        conn.commit()
        EXECUTOR.submit(execute_job, retry_job_id, job["agent_id"])
    elif decision["action"] == "skip":
        _advance_workflow(conn, run_id, step_index, f"[step skipped after failure: {decision['reason']}]")
    else:
        conn.execute(
            "UPDATE workflow_runs SET status = 'failed', completed_at = ? WHERE id = ?",
            (db.now(), run_id),
        )
        opportunities.mark_outcome_for_workflow(conn, run["workflow_id"], "failure")
        conn.commit()
