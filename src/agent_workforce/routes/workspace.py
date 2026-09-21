"""Shared workspace infrastructure toggles and usage/cost totals."""

import datetime

from fastapi import APIRouter, HTTPException

from .. import db

router = APIRouter()


@router.get("/api/infrastructure")
def list_infrastructure():
    conn = db.get_conn()
    rows = conn.execute("SELECT * FROM infrastructure").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("/api/infrastructure/{key}/toggle")
def toggle_infrastructure(key: str):
    conn = db.get_conn()
    row = conn.execute("SELECT * FROM infrastructure WHERE key = ?", (key,)).fetchone()
    if row is None:
        conn.close()
        raise HTTPException(404, "unknown infrastructure")
    conn.execute(
        "UPDATE infrastructure SET enabled = ? WHERE key = ?", (0 if row["enabled"] else 1, key)
    )
    conn.commit()
    row = conn.execute("SELECT * FROM infrastructure WHERE key = ?", (key,)).fetchone()
    conn.close()
    return dict(row)


@router.get("/api/usage")
def get_usage():
    conn = db.get_conn()
    totals = conn.execute(
        """SELECT COALESCE(SUM(cost), 0) AS cost, COALESCE(SUM(input_tokens), 0) AS in_tok,
           COALESCE(SUM(output_tokens), 0) AS out_tok, COUNT(*) AS n
           FROM jobs WHERE status = 'completed'"""
    ).fetchone()
    today_start = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    today = conn.execute(
        "SELECT COALESCE(SUM(cost), 0) AS cost FROM jobs WHERE status = 'completed' AND created_at >= ?",
        (today_start,),
    ).fetchone()
    conn.close()
    return {
        "total_cost": totals["cost"],
        "total_input_tokens": totals["in_tok"],
        "total_output_tokens": totals["out_tok"],
        "total_jobs": totals["n"],
        "today_cost": today["cost"],
    }


# ponytail: derived from existing tables (jobs/workflow_runs/automations/agents)
# rather than a dedicated activity-log table, so there's one write path per
# fact and nothing to keep in sync.
ACTIVITY_QUERY = """
SELECT created_at AS ts, name || ' joined the floor' AS label
  FROM agents
UNION ALL
SELECT jobs.completed_at AS ts,
  agents.name || CASE WHEN jobs.status = 'completed' THEN ' completed a task' ELSE ' failed a task' END AS label
  FROM jobs JOIN agents ON agents.id = jobs.agent_id
  WHERE jobs.status IN ('completed', 'failed') AND jobs.completed_at IS NOT NULL
UNION ALL
SELECT workflow_runs.completed_at AS ts,
  workflows.name || CASE WHEN workflow_runs.status = 'completed' THEN ' pipeline finished' ELSE ' pipeline failed' END AS label
  FROM workflow_runs JOIN workflows ON workflows.id = workflow_runs.workflow_id
  WHERE workflow_runs.status IN ('completed', 'failed') AND workflow_runs.completed_at IS NOT NULL
UNION ALL
SELECT automations.last_run_at AS ts,
  workflows.name || ' automation ' || automations.last_run_status AS label
  FROM automations JOIN workflows ON workflows.id = automations.workflow_id
  WHERE automations.last_run_at IS NOT NULL
ORDER BY ts DESC LIMIT 30
"""


@router.get("/api/activity")
def get_activity():
    conn = db.get_conn()
    rows = conn.execute(ACTIVITY_QUERY).fetchall()
    conn.close()
    return [dict(r) for r in rows]
