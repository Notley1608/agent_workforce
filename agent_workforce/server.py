"""Crew: a persistent visual workspace for AI agents.

Persistent workspace, real agents, concurrent workstations, shared
infrastructure, a cross-agent job board with cost tracking, linear
multi-agent workflows, and bounded automation (schedules gated by a daily
spend cap, per-job execution timeout).

Routes live under `routes/`, job execution lives in `jobs.py`, and the
automation scheduler lives in `automations.py` — this module only wires them
into the FastAPI app.
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from . import automations
from ..src.agent_workforce.routes import agents, automations as automations_routes, opportunities, plans, workflows, workspace

app = FastAPI(title="Crew")

STATIC_DIR = Path(__file__).parent / "static"

app.include_router(agents.router)
app.include_router(workflows.router)
app.include_router(automations_routes.router)
app.include_router(workspace.router)
app.include_router(plans.router)
app.include_router(opportunities.router)


@app.on_event("startup")
def _start_automation_scheduler():
    automations.start_scheduler(workflows.start_workflow_run)


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
