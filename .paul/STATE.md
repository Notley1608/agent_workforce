---
description: "agent_workforce — current position and accumulated context"
type: ProjectState
about: "agent_workforce"
---

# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-09-22)

**Core value:** The Owner can recruit AI agents (Groq-backed), give them
desks, and hand them real tasks that actually execute — locally,
single-user, no fake activity.
**Current focus:** v0.2 Revenue Connectors — Phase 3 of 3 (REST Connector Tool Calling) — Planning

## Current Position

Milestone: v0.2 Revenue Connectors (0.2.0)
Phase: 3 of 3 (REST Connector Tool Calling) — Planning
Plan: 03-01 created + audited, awaiting approval
Status: PLAN audited, ready for APPLY
Last activity: 2026-09-24 — Audited .paul/phases/03-rest-connector-tool-calling/03-01-PLAN.md

Progress:
- Milestone: [██████░░░░] 66%
- Phase 3: [░░░░░░░░░░] 0%

## Loop Position

Current loop state:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ○        ○     [Plan created, awaiting approval]
```

## Accumulated Context

### Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| No fake agent activity, ever | Init | Applies to all future phases |
| Risky capabilities always propose → human-approves-exact-action → fire | Init | Applies to any new capability with real-world side effects |
| Extend `agent_workforce` directly (Option B: custom on existing primitives) rather than fork StarNet or adopt a multi-agent framework | Phase 1 | Revenue-connector work (secrets, REST calling) builds on existing `jobs.py`/capability-gating, not a parallel system |
| MCP adoption deferred out of this milestone | Phase 1 | Phases 2-3 use direct REST + secret substitution only |
| 2026-09-22: Enterprise audit performed on phases/02-secret-substitution-ssrf-guard/02-01-PLAN.md. Applied 3 must-have, 2 strongly-recommended upgrades. Deferred 1 (SSRF redirect-chain protection, bound to Phase 3). Verdict: Conditionally acceptable → enterprise-ready after applied upgrades | Phase 2 | Plan strengthened for enterprise standards |
| 2026-09-24: Enterprise audit performed on phases/03-rest-connector-tool-calling/03-01-PLAN.md. Applied 1 must-have (response body size cap, AC-8), 1 strongly-recommended (overall connector timeout, AC-9). Deferred 1 (binary response body fidelity — functional limitation, not a security gap). Verdict: Conditionally acceptable → enterprise-ready after applied upgrades | Phase 3 | Plan strengthened for enterprise standards; AC count now 9 |

### Deferred Issues
- SSRF protection against redirect chains — deferred from Phase 2 (no HTTP client existed yet); Phase 3 must re-validate every redirect hop with `guard_ssrf`, not just the initial URL

### Blockers/Concerns
- Phase 3 must call `redact()` before any resolved secret value reaches `jobs.record_event` or a persisted `job_events`/`jobs.output` row — binding requirement from Phase 2, not optional

## Session Continuity

Last session: 2026-09-24
Stopped at: Plan 03-01 created + audited
Next action: Run /paul:apply .paul/phases/03-rest-connector-tool-calling/03-01-PLAN.md
Resume file: .paul/phases/03-rest-connector-tool-calling/03-01-PLAN.md

---
*STATE.md — Updated after every significant action*
