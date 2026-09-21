"""Pipeline (workflow) CRUD and linear multi-agent runs."""

import asyncio
import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import db, jobs, opportunities

router = APIRouter()


class CreateWorkflow(BaseModel):
    name: str
    agent_ids: list[str]


class RunWorkflow(BaseModel):
    input: str


def _workflow_row_to_dict(row) -> dict:
    d = dict(row)
    d["agent_ids"] = json.loads(d["agent_ids"])
    return d


def start_workflow_run(workflow_id: str, input_text: str) -> str:
    """Starts a workflow run. Shared by the manual run endpoint, mission/opportunity
    approval, and the automation scheduler - the one place new pipeline work begins,
    so it's the one place Operating Mode (Recovery, Emergency Stop) can block it."""
    conn = db.get_conn()
    workflow = conn.execute("SELECT * FROM workflows WHERE id = ?", (workflow_id,)).fetchone()
    if workflow is None:
        conn.close()
        raise ValueError("workflow not found")
    try:
        opportunities.ensure_can_start_work(conn)
    except opportunities.WorkforceBlockedError:
        conn.close()
        raise
    agent_ids = json.loads(workflow["agent_ids"])

    run_id = db.new_id()
    conn.execute(
        """INSERT INTO workflow_runs (id, workflow_id, status, input, created_at)
           VALUES (?, ?, 'running', ?, ?)""",
        (run_id, workflow_id, input_text, db.now()),
    )
    first_job_id = jobs.insert_job(conn, agent_ids[0], input_text, run_id, 0)
    conn.commit()
    conn.close()

    jobs.EXECUTOR.submit(jobs.execute_job, first_job_id, agent_ids[0])
    return run_id


@router.get("/api/workflows")
def list_workflows():
    conn = db.get_conn()
    rows = conn.execute("SELECT * FROM workflows ORDER BY created_at").fetchall()
    conn.close()
    return [_workflow_row_to_dict(r) for r in rows]


@router.post("/api/workflows")
def create_workflow(body: CreateWorkflow):
    if not body.agent_ids:
        raise HTTPException(400, "a workflow needs at least one step")
    conn = db.get_conn()
    for aid in body.agent_ids:
        if conn.execute("SELECT 1 FROM agents WHERE id = ?", (aid,)).fetchone() is None:
            conn.close()
            raise HTTPException(400, f"unknown agent: {aid}")
    workflow_id = db.new_id()
    conn.execute(
        "INSERT INTO workflows (id, name, agent_ids, created_at) VALUES (?, ?, ?, ?)",
        (workflow_id, body.name, json.dumps(body.agent_ids), db.now()),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM workflows WHERE id = ?", (workflow_id,)).fetchone()
    conn.close()
    return _workflow_row_to_dict(row)


@router.post("/api/workflows/{workflow_id}/run")
async def run_workflow(workflow_id: str, body: RunWorkflow):
    try:
        run_id = start_workflow_run(workflow_id, body.input)
    except ValueError:
        raise HTTPException(404, "workflow not found")
    except opportunities.WorkforceBlockedError as exc:
        raise HTTPException(403, str(exc))
    await asyncio.sleep(0)
    return {"run_id": run_id, "status": "running"}


@router.get("/api/workflows/{workflow_id}/runs")
def list_workflow_runs(workflow_id: str):
    conn = db.get_conn()
    runs = conn.execute(
        "SELECT * FROM workflow_runs WHERE workflow_id = ? ORDER BY created_at DESC", (workflow_id,)
    ).fetchall()
    result = []
    for run in runs:
        steps = conn.execute(
            """SELECT jobs.*, agents.name AS agent_name FROM jobs
               JOIN agents ON agents.id = jobs.agent_id
               WHERE jobs.workflow_run_id = ?
               ORDER BY jobs.step_index, jobs.created_at""",
            (run["id"],),
        ).fetchall()
        d = dict(run)
        d["steps"] = [jobs.job_row_to_dict(s) for s in steps]
        result.append(d)
    conn.close()
    return result
