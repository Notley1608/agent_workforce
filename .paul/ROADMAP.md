---
description: "agent_workforce — milestone and phase structure"
type: Roadmap
about: "agent_workforce"
---

# Roadmap: agent_workforce

## Overview

A local-first crew workspace where an Owner recruits Groq-backed AI agents
and an Orchestrator agent oversees research and production work aimed at
building revenue — starting from manual mission staffing and growing into
self-directed Business Agent loops.

## Current Milestone

**v0.2 Revenue Connectors** (0.2.0)
Status: 🚧 In Progress
Phases: 2 of 3 complete

## Phases

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Architecture Selection | 0 (discovery-only) | Complete | 2026-09-22 |
| 2 | Secret Substitution & SSRF Guard | 1/1 | Complete | 2026-09-22 |
| 3 | REST Connector Tool Calling | 1 | Planning | - |

## Phase Details

### Phase 1: Architecture Selection

Focus: Decide whether to fork StarNet, build custom on existing primitives,
or adopt an existing multi-agent framework, for the revenue-connector pieces
`agent_workforce` is missing (secret substitution, REST connector calling).

Plans: TBD (defined during `/paul:plan`)

Discovery: complete — see
`.paul/phases/01-architecture-selection/DISCOVERY.md`. Recommends extending
`agent_workforce` directly (Option B: custom on existing primitives —
`jobs.py` agent loop, existing capability gating, existing Docker sandbox),
not forking StarNet and not adopting a framework. MCP adoption is
deliberately deferred out of this milestone's scope.

**Closed discovery-only** — the phase's entire scope was the architecture
decision itself, which discovery + owner confirmation already resolved. No
PLAN/APPLY/UNIFY cycle needed; no code deliverable was in scope.

### Phase 2: Secret Substitution & SSRF Guard

Focus: `${KEY_NAME}` placeholder resolution at dispatch time, secrets
stripped from anything logged/persisted, placeholders refused in URLs,
private/loopback/metadata IPs blocked outright.

Plans: 1/1 complete — see
`.paul/phases/02-secret-substitution-ssrf-guard/02-01-SUMMARY.md`

**Complete** — `agent_workforce/connectors.py` (stdlib-only, unwired):
`resolve_secrets`, `redact`, `guard_ssrf`. Enterprise-audited before APPLY
(3 must-have + 2 strongly-recommended fixes applied — see
`02-01-AUDIT.md`); 8 acceptance criteria, 79/79 tests passing. `guard_ssrf`
returns validated resolved addresses (not `None`) so Phase 3 must connect
to the checked address rather than re-resolving DNS. SSRF protection
against redirect chains is explicitly deferred to Phase 3.

### Phase 3: REST Connector Tool Calling

Focus: Wire the secret-substitution layer into `jobs.py` so a job
(especially a Business Agent job) can call an external REST API as a
capability, gated like `files`/`terminal` (propose → approve → fire).

Must additionally cover (carried from Phase 2): re-validate every redirect
hop with `guard_ssrf` (not just the initial URL), and call `redact()`
before any resolved secret value reaches `jobs.record_event` or a
persisted `job_events`/`jobs.output` row.

Plans: 03-01 created, awaiting approval — see
`.paul/phases/03-rest-connector-tool-calling/03-01-PLAN.md`

---
*Roadmap created: 2026-09-22*
*Last updated: 2026-09-22 after Phase 2*
