"""Background scheduler: recurring pipeline execution, bounded by a daily spend cap.

Automations only decide *when* to trigger a workflow run — the run itself
uses the same job/workflow machinery as a manual run, so its progress and
history show up in the normal workflow runs view. Nothing here is a separate,
invisible execution path.
"""

import datetime
import sys
import threading
import time

from . import db, opportunities

CHECK_INTERVAL_SECONDS = 15


def compute_next_run(schedule_type: str, interval_minutes: int | None, daily_at: str | None, after: float) -> float:
    if schedule_type == "interval":
        if not interval_minutes or interval_minutes < 1:
            raise ValueError("interval_minutes must be a positive integer")
        return after + interval_minutes * 60
    if schedule_type == "daily":
        hour, minute = map(int, daily_at.split(":"))
        dt = datetime.datetime.fromtimestamp(after).replace(hour=hour, minute=minute, second=0, microsecond=0)
        if dt.timestamp() <= after:
            dt += datetime.timedelta(days=1)
        return dt.timestamp()
    raise ValueError(f"unknown schedule_type: {schedule_type}")


def today_cost(conn) -> float:
    today_start = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    row = conn.execute(
        "SELECT COALESCE(SUM(cost), 0) AS cost FROM jobs WHERE status = 'completed' AND created_at >= ?",
        (today_start,),
    ).fetchone()
    return row["cost"]


def get_daily_limit(conn) -> float | None:
    row = conn.execute("SELECT value FROM settings WHERE key = 'daily_spend_limit'").fetchone()
    return float(row["value"]) if row and row["value"] else None


def run_due_automations(trigger_run_fn) -> None:
    """trigger_run_fn(workflow_id, input) starts a workflow run and returns its run id."""
    conn = db.get_conn()
    now = db.now()
    due = conn.execute("SELECT * FROM automations WHERE enabled = 1 AND next_run_at <= ?", (now,)).fetchall()
    limit = get_daily_limit(conn)

    for automation in due:
        over_budget = limit is not None and today_cost(conn) >= limit
        status = "skipped_budget" if over_budget else "ran"
        if not over_budget:
            try:
                trigger_run_fn(automation["workflow_id"], automation["input"])
            except opportunities.WorkforceBlockedError:
                status = "skipped_recovery"

        next_run = compute_next_run(
            automation["schedule_type"], automation["interval_minutes"], automation["daily_at"], now
        )
        conn.execute(
            "UPDATE automations SET last_run_at = ?, last_run_status = ?, next_run_at = ? WHERE id = ?",
            (now, status, next_run, automation["id"]),
        )
        conn.commit()
    conn.close()


def start_scheduler(trigger_run_fn) -> None:
    def loop():
        while True:
            try:
                run_due_automations(trigger_run_fn)
            except Exception as exc:
                print(f"[automations] scheduler tick failed: {exc}", file=sys.stderr)
            time.sleep(CHECK_INTERVAL_SECONDS)

    threading.Thread(target=loop, daemon=True, name="automation-scheduler").start()
