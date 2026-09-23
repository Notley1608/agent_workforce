---
description: "The Owner can recruit AI agents (Groq-backed), give them desks, and hand them real tasks that actually execute — locally, single-user, no fake activity."
type: Project
about: "agent_workforce"
---

# agent_workforce

## What This Is

A local-first "crew" workspace: FastAPI + SQLite backend, React/Vite frontend
with a 2.5D village view, where an Owner recruits AI agents and an
Orchestrator agent oversees research and production work, with the focus of
building revenue — via missions with a static workflow chain, or
self-directed "Business Agent" loops with their own budget/economics.

## Core Value

The Owner can recruit AI agents (Groq-backed), give them desks, and hand
them real tasks that actually execute — locally, single-user, no fake
activity.

## Current State

| Attribute | Value |
|-----------|-------|
| Type | Application |
| Version | 0.0.0 |
| Status | Prototype |
| Last Updated | 2026-09-22 |

## Requirements

### Core Features

- Recruit agents manually — `POST /api/agents` is the only path that creates
  a researcher/worker `agents` row
- Approve missions/plans, which auto-staff from the existing roster
  (`planner.assign_agents_and_workflow`)
- Approve or reject risky actions (files, terminal) before they execute
  (`awaiting_approval` gate)
- Promote an opportunity into a standing Business Agent that self-directs
  against a budget (`create_business` → `jobs._continue_business`)
- Retire agents to free up recruit-cap slots

### Validated (Shipped)
- ✓ Secret placeholder resolution (`${KEY_NAME}` in headers, never URLs) — Phase 2
- ✓ Secret redaction before logging/persisting — Phase 2
- ✓ SSRF guard blocking private/loopback/link-local/multicast/reserved/unspecified targets — Phase 2

### Active (In Progress)
None yet.

### Planned (Next)
- Wire `connectors.py` into `jobs.py` as a gated capability (propose → approve → fire), same pattern as `files`/`terminal` — Phase 3
- Redirect-chain SSRF re-validation and `redact()`-before-log enforcement, both carried forward from Phase 2 — Phase 3

### Out of Scope
- Multi-tenant / multi-user support
- Auth layer

## Target Users

**Primary:** The Owner — a single local user who recruits agents, approves
risky actions, and directs work toward revenue-generating outcomes.

## Context

**Business Context:**
The system centers on an Orchestrator agent that oversees research and
production work with the explicit goal of building revenue, via Business
Agents running self-directed loops against a budget.

**Technical Context:**
Single-user, single-machine tool. No `--reload` on the backend — changes
require a manual restart before live verification.

## Constraints

### Technical Constraints

- Single-user/single-machine, no auth layer
- Requires `GROQ_API_KEY` — every agent runs on Groq
- Recruit caps enforced per `role_type`
  (`opportunities.MAX_AGENTS_BY_ROLE_TYPE`) — never silently raised to fit
  live data, conflicts get surfaced and asked about
- Risky capabilities (files, terminal) must pause at `awaiting_approval` for
  Owner sign-off, never run unattended
- Terminal risky actions run isolated in a throwaway Docker container
  (`--network none`, read-only root, `--tmpfs /tmp`, capped memory/pids)

### Business Constraints
- To be defined during `/paul:plan`

## Key Decisions

| Decision | Rationale | Date | Status |
|----------|-----------|------|--------|
| No fake agent activity, ever | Every visible/backend state must reflect something that actually happened | 2026-09-22 | Active |
| Risky capabilities (files, terminal) always propose → human-approves-exact-action → fire | Files/terminal have real-world effects outside the app | 2026-09-22 | Active |
| Extend `agent_workforce` directly (Option B) rather than fork StarNet or adopt a framework | Existing primitives (`jobs.py`, capability gating, Docker sandbox) already cover most of what a custom orchestrator needs | 2026-09-22 | Active |
| `guard_ssrf` returns validated resolved addresses rather than `None` | Prevents a TOCTOU/DNS-rebinding gap where a future caller re-resolves DNS after the check | 2026-09-22 | Active |
| Empty-but-set secret env vars are rejected, not silently substituted | Avoids a silently-broken/unauthenticated request with no audit trail of the failure | 2026-09-22 | Active |

## Success Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Fabricated/fake activity in UI or backend state | Zero, always | - | On track |
| Business Agent self-directed loop | Runs toward revenue within budget, escalates only when genuinely blocked | - | Not started |

## Tech Stack / Tools

| Layer | Technology | Notes |
|-------|------------|-------|
| Backend | FastAPI + SQLite (stdlib only) | Single file DB at `~/.agent_workforce/crew.db` |
| Frontend | React/Vite | TanStack Query (server state), Zustand (UI/world state only), Zod (schemas mirroring backend) |
| Model provider | Groq | Sole provider — every agent run |
| Sandboxing | Docker | Throwaway container for terminal risky actions, `--network none` |
| Serving | Single local process | `frontend/dist` mounted as static files by `server.py`, no cloud deploy |

## Links

| Resource | URL |
|----------|-----|
| Repository | (local) |

---
*PROJECT.md — Updated when requirements or context change*
*Last updated: 2026-09-22 after Phase 2*
