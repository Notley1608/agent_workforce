"""Automation (recurring pipeline run) CRUD, plus the daily spend cap setting."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import automations as scheduler, opportunities
from .. import db

router = APIRouter()


class CreateAutomation(BaseModel):
    schedule_type: str  # "interval" | "daily"
    interval_minutes: int | None = None
    daily_at: str | None = None  # "HH:MM"
    input: str


class SetBudget(BaseModel):
    daily_limit: float | None = None
    recovery_threshold: float | None = None
    emergency_stop: bool | None = None


@router.get("/api/workflows/{workflow_id}/automations")
def list_automations(workflow_id: str):
    conn = db.get_conn()
    rows = conn.execute(
        "SELECT * FROM automations WHERE workflow_id = ? ORDER BY created_at", (workflow_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("/api/workflows/{workflow_id}/automations")
def create_automation(workflow_id: str, body: CreateAutomation):
    conn = db.get_conn()
    if conn.execute("SELECT 1 FROM workflows WHERE id = ?", (workflow_id,)).fetchone() is None:
        conn.close()
        raise HTTPException(404, "workflow not found")
    now = db.now()
    try:
        next_run = scheduler.compute_next_run(body.schedule_type, body.interval_minutes, body.daily_at, now)
    except ValueError as exc:
        conn.close()
        raise HTTPException(400, str(exc))
    automation_id = db.new_id()
    conn.execute(
        """INSERT INTO automations
           (id, workflow_id, schedule_type, interval_minutes, daily_at, input, enabled, next_run_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)""",
        (automation_id, workflow_id, body.schedule_type, body.interval_minutes, body.daily_at, body.input, next_run, now),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM automations WHERE id = ?", (automation_id,)).fetchone()
    conn.close()
    return dict(row)


@router.post("/api/automations/{automation_id}/toggle")
def toggle_automation(automation_id: str):
    conn = db.get_conn()
    row = conn.execute("SELECT * FROM automations WHERE id = ?", (automation_id,)).fetchone()
    if row is None:
        conn.close()
        raise HTTPException(404, "automation not found")
    conn.execute("UPDATE automations SET enabled = ? WHERE id = ?", (0 if row["enabled"] else 1, automation_id))
    conn.commit()
    row = conn.execute("SELECT * FROM automations WHERE id = ?", (automation_id,)).fetchone()
    conn.close()
    return dict(row)


@router.delete("/api/automations/{automation_id}")
def delete_automation(automation_id: str):
    conn = db.get_conn()
    conn.execute("DELETE FROM automations WHERE id = ?", (automation_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


def _settings_dict(conn) -> dict:
    return {
        "daily_spend_limit": scheduler.get_daily_limit(conn),
        "recovery_threshold": opportunities.get_recovery_threshold(conn),
        "emergency_stop": opportunities.is_emergency_stopped(conn),
        "operating_mode": opportunities.operating_mode(conn),
    }


@router.get("/api/settings")
def get_settings():
    conn = db.get_conn()
    result = _settings_dict(conn)
    conn.close()
    return result


def _set_setting(conn, key: str, value) -> None:
    conn.execute(
        """INSERT INTO settings (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value""",
        (key, str(value) if value is not None else None),
    )


@router.post("/api/settings")
def update_settings(body: SetBudget):
    # Only touches keys actually sent, so setting one field never wipes the
    # others (workspace.ts's daily-budget form only ever sends daily_limit).
    provided = body.model_dump(exclude_unset=True)
    conn = db.get_conn()
    if "daily_limit" in provided:
        _set_setting(conn, "daily_spend_limit", provided["daily_limit"])
    if "recovery_threshold" in provided:
        _set_setting(conn, "recovery_threshold", provided["recovery_threshold"])
    if "emergency_stop" in provided:
        _set_setting(conn, "emergency_stop", "1" if provided["emergency_stop"] else None)
    conn.commit()
    result = _settings_dict(conn)
    conn.close()
    return result
