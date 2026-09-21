"""Agent CRUD and task assignment."""

import asyncio
import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import db, jobs, opportunities, planner

router = APIRouter()


class CreateAgent(BaseModel):
    name: str
    role: str
    role_type: str = "worker"
    capabilities_override: list[str] | None = None
    avatar: str = "🤖"
    provider: str = "groq"
    model: str = "openai/gpt-oss-120b"
    instructions: str = ""
    desk_x: float = 0
    desk_y: float = 0


class ProposeAgent(BaseModel):
    brief: str


class AssignTask(BaseModel):
    input: str


@router.get("/api/agents")
def list_agents():
    # Worker profile stats derived straight from real job history, joined in
    # here so the existing 4s polling in agents.ts picks them up for free.
    conn = db.get_conn()
    rows = conn.execute(
        """SELECT agents.*,
                  COUNT(CASE WHEN jobs.status IN ('completed', 'failed') THEN 1 END) AS jobs_done,
                  COUNT(CASE WHEN jobs.status = 'completed' THEN 1 END) AS jobs_completed,
                  COALESCE(SUM(jobs.cost), 0) AS total_cost,
                  (SELECT input FROM jobs WHERE jobs.agent_id = agents.id AND jobs.status = 'running'
                   ORDER BY started_at DESC LIMIT 1) AS current_job_input
           FROM agents
           LEFT JOIN jobs ON jobs.agent_id = agents.id
           GROUP BY agents.id
           ORDER BY agents.created_at"""
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("/api/agents")
def create_agent(body: CreateAgent):
    conn = db.get_conn()
    try:
        opportunities.ensure_can_recruit_agent(conn, body.role_type)
    except opportunities.WorkforceBlockedError as exc:
        conn.close()
        raise HTTPException(403, str(exc))
    agent_id = db.new_id()
    # No explicit override from the owner: fall back to the role_type's safety
    # default (see planner.default_capabilities_for_role_type) rather than
    # inheriting every enabled capability - this is the only agent-creation
    # path left, so it's the only place left to apply that default.
    capabilities_override = (
        body.capabilities_override
        if body.capabilities_override is not None
        else planner.default_capabilities_for_role_type(body.role_type)
    )
    conn.execute(
        """INSERT INTO agents
           (id, name, role, role_type, capabilities_override, avatar, provider, model,
            instructions, desk_x, desk_y, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'idle', ?)""",
        (
            agent_id,
            body.name,
            body.role,
            body.role_type,
            json.dumps(capabilities_override) if capabilities_override is not None else None,
            body.avatar,
            body.provider,
            body.model,
            body.instructions,
            body.desk_x,
            body.desk_y,
            db.now(),
        ),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
    conn.close()
    return dict(row)


@router.delete("/api/agents/{agent_id}")
def retire_agent(agent_id: str):
    """The other half of the recruit cap: retiring is the only way to free a
    slot under MAX_AGENTS_BY_ROLE_TYPE once it's full (see
    ensure_can_recruit_agent's error message)."""
    conn = db.get_conn()
    agent = conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
    if agent is None:
        conn.close()
        raise HTTPException(404, "agent not found")
    if agent["status"] == "working":
        conn.close()
        raise HTTPException(409, "agent is currently working; wait for it to finish before retiring it")
    conn.execute("DELETE FROM job_events WHERE job_id IN (SELECT id FROM jobs WHERE agent_id = ?)", (agent_id,))
    conn.execute("DELETE FROM jobs WHERE agent_id = ?", (agent_id,))
    conn.execute("DELETE FROM agents WHERE id = ?", (agent_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


@router.post("/api/agents/propose")
def propose_agent(body: ProposeAgent):
    """Agent Builder: the Orchestrator drafts a role/instructions for the
    owner to review in the recruit dialog - nothing is created here."""
    conn = db.get_conn()
    try:
        draft = planner.propose_agent(conn, body.brief)
    except ValueError as exc:
        conn.close()
        raise HTTPException(502, str(exc))
    conn.close()
    return draft


@router.get("/api/agents/{agent_id}")
def get_agent(agent_id: str):
    conn = db.get_conn()
    row = conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
    conn.close()
    if row is None:
        raise HTTPException(404, "agent not found")
    return dict(row)


@router.get("/api/agents/{agent_id}/jobs")
def list_jobs(agent_id: str):
    conn = db.get_conn()
    rows = conn.execute(
        "SELECT * FROM jobs WHERE agent_id = ? ORDER BY created_at DESC", (agent_id,)
    ).fetchall()
    conn.close()
    return [jobs.job_row_to_dict(r) for r in rows]


@router.get("/api/jobs")
def list_all_jobs():
    conn = db.get_conn()
    rows = conn.execute(
        """SELECT jobs.*, agents.name AS agent_name FROM jobs
           JOIN agents ON agents.id = jobs.agent_id
           ORDER BY jobs.created_at DESC LIMIT 200"""
    ).fetchall()
    conn.close()
    return [jobs.job_row_to_dict(r) for r in rows]


@router.post("/api/jobs/{job_id}/cancel")
def cancel_job(job_id: str):
    conn = db.get_conn()
    cur = conn.execute(
        "UPDATE jobs SET status = 'cancelled', completed_at = ? WHERE id = ? AND status IN ('pending', 'running')",
        (db.now(), job_id),
    )
    if cur.rowcount == 0:
        conn.close()
        raise HTTPException(409, "job already finished")
    jobs.record_event(conn, job_id, "Cancelled by user")
    row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if row["workflow_run_id"] is not None:
        conn.execute(
            "UPDATE workflow_runs SET status = 'cancelled', completed_at = ? WHERE id = ?",
            (db.now(), row["workflow_run_id"]),
        )
    conn.commit()
    conn.close()
    return jobs.job_row_to_dict(row)


@router.post("/api/jobs/{job_id}/approve")
def approve_job(job_id: str):
    """Releases a job paused on a risky capability (e.g. writing a file) to actually happen."""
    conn = db.get_conn()
    job = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if job is None:
        conn.close()
        raise HTTPException(404, "job not found")
    if job["status"] != "awaiting_approval":
        conn.close()
        raise HTTPException(409, f"job is {job['status']}, not awaiting approval")

    capabilities = json.loads(job["risky_capabilities"] or "[]")
    output, labels = jobs.apply_risky_actions(job_id, capabilities, job["output"] or "")
    cur = conn.execute(
        "UPDATE jobs SET status = 'completed', output = ?, completed_at = ? WHERE id = ? AND status = 'awaiting_approval'",
        (output, db.now(), job_id),
    )
    if cur.rowcount:
        for label in labels:
            jobs.record_event(conn, job_id, f"Approved: {label}")
        conn.commit()
        if job["workflow_run_id"] is not None:
            jobs._advance_workflow(conn, job["workflow_run_id"], job["step_index"], output)
        elif job["opportunity_id"] is not None:
            jobs._continue_business(conn, job["opportunity_id"], output)
    conn.close()
    return {"ok": True, "output": output}


@router.post("/api/jobs/{job_id}/reject")
def reject_job(job_id: str):
    """Declines a risky action. Reuses the same recovery path as a failed step."""
    conn = db.get_conn()
    job = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if job is None:
        conn.close()
        raise HTTPException(404, "job not found")
    if job["status"] != "awaiting_approval":
        conn.close()
        raise HTTPException(409, f"job is {job['status']}, not awaiting approval")

    error = "rejected by human: risky capability not approved"
    cur = conn.execute(
        "UPDATE jobs SET status = 'failed', error = ?, completed_at = ? WHERE id = ? AND status = 'awaiting_approval'",
        (error, db.now(), job_id),
    )
    if cur.rowcount:
        jobs.record_event(conn, job_id, f"Rejected: {error}")
        conn.commit()
        if job["workflow_run_id"] is not None:
            agent = conn.execute("SELECT * FROM agents WHERE id = ?", (job["agent_id"],)).fetchone()
            jobs._handle_step_failure(conn, job, agent, error)
        elif job["opportunity_id"] is not None:
            jobs._continue_business(conn, job["opportunity_id"], f"[previous job rejected: {error}]")
    conn.close()
    return {"ok": True}


@router.get("/api/jobs/{job_id}/timeline")
def get_job_timeline(job_id: str):
    conn = db.get_conn()
    rows = conn.execute(
        "SELECT * FROM job_events WHERE job_id = ? ORDER BY created_at", (job_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("/api/agents/{agent_id}/tasks")
async def assign_task(agent_id: str, body: AssignTask):
    conn = db.get_conn()
    agent = conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
    if agent is None:
        conn.close()
        raise HTTPException(404, "agent not found")
    if agent["status"] == "working":
        conn.close()
        raise HTTPException(409, "agent is already working")
    try:
        opportunities.ensure_can_start_work(conn)
    except opportunities.WorkforceBlockedError as exc:
        conn.close()
        raise HTTPException(403, str(exc))

    job_id = jobs.insert_job(conn, agent_id, body.input)
    conn.commit()
    conn.close()

    jobs.EXECUTOR.submit(jobs.execute_job, job_id, agent_id)
    await asyncio.sleep(0)  # yield so the running status is visible immediately
    return {"job_id": job_id, "status": "running"}
