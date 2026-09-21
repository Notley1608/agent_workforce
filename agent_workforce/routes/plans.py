"""Objective -> plan -> approval -> execution.

The autonomy loop's first phase: a model proposes a plan, a human approves or
rejects it, and approval hands off to the existing workflow engine
(routes/workflows.py) to actually run it - no separate execution path.
"""

import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import db, opportunities, planner
from . import workflows

router = APIRouter()


class ProposePlan(BaseModel):
    objective: str
    opportunity_id: str | None = None


def _plan_row_to_dict(row) -> dict:
    d = dict(row)
    d["steps"] = json.loads(d["steps"])
    d["warnings"] = json.loads(d["warnings"])
    return d


@router.get("/api/plans")
def list_plans():
    conn = db.get_conn()
    rows = conn.execute("SELECT * FROM plans ORDER BY created_at DESC").fetchall()
    conn.close()
    return [_plan_row_to_dict(r) for r in rows]


@router.post("/api/plans")
def propose_plan(body: ProposePlan):
    conn = db.get_conn()
    if body.opportunity_id is not None:
        if conn.execute("SELECT 1 FROM opportunities WHERE id = ?", (body.opportunity_id,)).fetchone() is None:
            conn.close()
            raise HTTPException(404, "opportunity not found")
    try:
        plan = planner.propose_plan(conn, body.objective)
    except ValueError as exc:
        conn.close()
        raise HTTPException(502, str(exc))

    plan_id = db.new_id()
    conn.execute(
        """INSERT INTO plans (id, objective, summary, steps, warnings, status, opportunity_id, created_at)
           VALUES (?, ?, ?, ?, ?, 'proposed', ?, ?)""",
        (
            plan_id,
            body.objective,
            plan["summary"],
            json.dumps(plan["steps"]),
            json.dumps(plan["warnings"]),
            body.opportunity_id,
            db.now(),
        ),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM plans WHERE id = ?", (plan_id,)).fetchone()
    conn.close()
    return _plan_row_to_dict(row)


@router.post("/api/plans/{plan_id}/approve")
def approve_plan(plan_id: str):
    conn = db.get_conn()
    row = conn.execute("SELECT * FROM plans WHERE id = ?", (plan_id,)).fetchone()
    if row is None:
        conn.close()
        raise HTTPException(404, "plan not found")
    if row["status"] != "proposed":
        conn.close()
        raise HTTPException(409, f"plan already {row['status']}")

    steps = json.loads(row["steps"])
    try:
        workflow_id, agent_ids = planner.assign_agents_and_workflow(conn, row["objective"], steps)
    except opportunities.WorkforceBlockedError as exc:
        conn.close()
        raise HTTPException(403, str(exc))
    conn.execute("UPDATE plans SET status = 'approved', workflow_id = ? WHERE id = ?", (workflow_id, plan_id))
    if row["opportunity_id"]:
        opportunities.attach_workflow(conn, row["opportunity_id"], workflow_id)
    conn.commit()
    conn.close()

    try:
        run_id = workflows.start_workflow_run(workflow_id, row["objective"])
    except opportunities.WorkforceBlockedError as exc:
        raise HTTPException(403, str(exc))
    return {"plan_id": plan_id, "workflow_id": workflow_id, "run_id": run_id, "agent_ids": agent_ids}


@router.post("/api/plans/{plan_id}/reject")
def reject_plan(plan_id: str):
    conn = db.get_conn()
    cur = conn.execute("UPDATE plans SET status = 'rejected' WHERE id = ? AND status = 'proposed'", (plan_id,))
    if cur.rowcount == 0:
        conn.close()
        raise HTTPException(409, "plan not found or already resolved")
    conn.commit()
    conn.close()
    return {"ok": True}
