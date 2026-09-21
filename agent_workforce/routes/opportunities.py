"""Opportunity CRUD, Orchestrator-driven discovery, and the ledger view behind Recovery Mode."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import db, opportunities

router = APIRouter()


class CreateOpportunity(BaseModel):
    title: str
    description: str = ""
    forecast_value: float | None = None


class DiscoverOpportunities(BaseModel):
    hint: str = ""


class SetStatus(BaseModel):
    status: str


class RecordRevenue(BaseModel):
    amount: float
    note: str = ""


class RecordLearning(BaseModel):
    note: str


class AskOrchestrator(BaseModel):
    question: str


@router.get("/api/opportunities")
def list_opportunities():
    conn = db.get_conn()
    rows = conn.execute("SELECT * FROM opportunities ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.get("/api/opportunities/{opportunity_id}")
def get_opportunity(opportunity_id: str):
    conn = db.get_conn()
    row = conn.execute("SELECT * FROM opportunities WHERE id = ?", (opportunity_id,)).fetchone()
    if row is None:
        conn.close()
        raise HTTPException(404, "opportunity not found")
    ledger = conn.execute(
        "SELECT * FROM ledger WHERE opportunity_id = ? ORDER BY created_at DESC", (opportunity_id,)
    ).fetchall()
    plans = conn.execute(
        "SELECT * FROM plans WHERE opportunity_id = ? ORDER BY created_at DESC", (opportunity_id,)
    ).fetchall()
    conn.close()
    d = dict(row)
    d["ledger"] = [dict(r) for r in ledger]
    d["plan_ids"] = [r["id"] for r in plans]
    return d


@router.post("/api/opportunities")
def create_opportunity(body: CreateOpportunity):
    conn = db.get_conn()
    opportunity_id = opportunities.create_opportunity(conn, body.title, body.description, body.forecast_value)
    conn.commit()
    row = conn.execute("SELECT * FROM opportunities WHERE id = ?", (opportunity_id,)).fetchone()
    conn.close()
    return dict(row)


@router.post("/api/opportunities/discover")
def discover(body: DiscoverOpportunities):
    conn = db.get_conn()
    try:
        created = opportunities.discover_opportunities(conn, body.hint)
    except ValueError as exc:
        conn.close()
        raise HTTPException(502, str(exc))
    conn.close()
    return created


@router.post("/api/opportunities/{opportunity_id}/status")
def set_status(opportunity_id: str, body: SetStatus):
    conn = db.get_conn()
    if conn.execute("SELECT 1 FROM opportunities WHERE id = ?", (opportunity_id,)).fetchone() is None:
        conn.close()
        raise HTTPException(404, "opportunity not found")
    try:
        opportunities.set_status(conn, opportunity_id, body.status)
    except ValueError as exc:
        conn.close()
        raise HTTPException(400, str(exc))
    conn.commit()
    row = conn.execute("SELECT * FROM opportunities WHERE id = ?", (opportunity_id,)).fetchone()
    conn.close()
    return dict(row)


@router.post("/api/opportunities/{opportunity_id}/revenue")
def record_revenue(opportunity_id: str, body: RecordRevenue):
    conn = db.get_conn()
    if conn.execute("SELECT 1 FROM opportunities WHERE id = ?", (opportunity_id,)).fetchone() is None:
        conn.close()
        raise HTTPException(404, "opportunity not found")
    opportunities.record_ledger(conn, "revenue", body.amount, opportunity_id=opportunity_id, note=body.note)
    conn.commit()
    conn.close()
    return {"ok": True}


@router.post("/api/opportunities/{opportunity_id}/notes")
def record_learning(opportunity_id: str, body: RecordLearning):
    conn = db.get_conn()
    try:
        opportunities.record_learning(conn, opportunity_id, body.note)
    except ValueError as exc:
        conn.close()
        raise HTTPException(404, str(exc))
    conn.commit()
    row = conn.execute("SELECT * FROM opportunities WHERE id = ?", (opportunity_id,)).fetchone()
    conn.close()
    return dict(row)


@router.get("/api/orchestrator/messages")
def list_orchestrator_messages():
    conn = db.get_conn()
    rows = conn.execute("SELECT * FROM orchestrator_messages ORDER BY created_at").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("/api/orchestrator/ask")
def ask_orchestrator(body: AskOrchestrator):
    conn = db.get_conn()
    answer = opportunities.ask_orchestrator(conn, body.question)
    conn.close()
    return {"answer": answer}


@router.get("/api/ledger")
def get_ledger():
    conn = db.get_conn()
    rows = conn.execute("SELECT * FROM ledger ORDER BY created_at DESC LIMIT 200").fetchall()
    bal = opportunities.balance(conn)
    mode = opportunities.operating_mode(conn)
    totals = conn.execute(
        """SELECT COALESCE(SUM(CASE WHEN kind = 'revenue' THEN amount ELSE 0 END), 0) AS revenue,
                  COALESCE(SUM(CASE WHEN kind = 'cost' THEN amount ELSE 0 END), 0) AS cost
           FROM ledger"""
    ).fetchone()
    conn.close()
    return {
        "balance": bal,
        "recovery_mode": mode != "running",
        "mode": mode,
        "total_revenue": totals["revenue"],
        "total_cost": totals["cost"],
        "entries": [dict(r) for r in rows],
    }
