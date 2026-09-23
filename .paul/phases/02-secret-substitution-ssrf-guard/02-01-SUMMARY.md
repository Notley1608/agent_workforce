---
phase: 02-secret-substitution-ssrf-guard
plan: 01
subsystem: infra
tags: [ssrf, secrets, security, stdlib]
requires:
  - phase: 01-architecture-selection
    provides: "Option B decision — extend agent_workforce directly on existing primitives"
provides:
  - "connectors.py: resolve_secrets, redact, guard_ssrf — stdlib-only, unwired"
affects: [03-rest-connector-tool-calling]
tech-stack:
  added: []
  patterns: ["propose-then-approve secret handling: resolve -> redact before any log/persist"]
key-files:
  created: [agent_workforce/connectors.py]
  modified: [agent_workforce/test_server.py]
key-decisions:
  - "SSRF guard returns validated resolved addresses so Phase 3 connects to the checked address, closing a TOCTOU/DNS-rebinding gap"
  - "Empty-but-set secret env vars are rejected, not silently substituted"
patterns-established:
  - "redact() sorts secret values longest-first to avoid substring-collision leakage"
duration: ~25min
started: 2026-09-22T09:00:00
completed: 2026-09-22T10:00:00
description: "Secret placeholder resolution + redaction + SSRF guard as a standalone stdlib-only module"
type: Summary
about: "agent_workforce"
---

# Phase 2 Plan 1: Secret Substitution & SSRF Guard Summary

**Standalone `connectors.py` resolves `${KEY_NAME}` secret placeholders into headers only, redacts resolved values before logging, and blocks SSRF-prone request targets — unwired, stdlib-only, ready for Phase 3 to import.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~25min |
| Started | 2026-09-22T09:00:00 |
| Completed | 2026-09-22T10:00:00 |
| Tasks | 2 completed |
| Files modified | 2 (1 created, 1 modified) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Placeholder secret resolution | Pass | `test_resolve_secrets_substitutes_placeholder_from_env` |
| AC-2: Placeholder in URL refused | Pass | `test_resolve_secrets_refuses_placeholder_in_url` |
| AC-3: Redaction strips secret values | Pass | `test_redact_strips_secret_from_text` |
| AC-4: SSRF guard blocks private/loopback/link-local/metadata | Pass | 3 tests: loopback, metadata IP, RFC1918 |
| AC-5: SSRF guard allows public targets | Pass | `test_guard_ssrf_allows_public_target` |
| AC-6: SSRF guard blocks unspecified addresses | Pass | `test_guard_ssrf_blocks_unspecified_address` |
| AC-7: Empty-but-set secret rejected | Pass | `test_resolve_secrets_rejects_empty_env_var` |
| AC-8: Substring-collision redaction ordering | Pass | `test_redact_handles_substring_secret_values` |

## Accomplishments

- Built `connectors.py` with `resolve_secrets`, `redact`, `guard_ssrf` — zero new dependencies, stdlib only (`re`, `os`, `socket`, `ipaddress`, `urllib.parse`)
- `guard_ssrf` returns validated resolved addresses rather than `None`, so Phase 3's HTTP client can connect to the exact address that was checked instead of re-resolving DNS (closes a TOCTOU/DNS-rebinding gap identified in the enterprise audit)
- 11 new tests in `ConnectorTest` covering all 8 ACs; full suite at 79/79 passing

## Files Modified

| File | Change |
|------|--------|
| `agent_workforce/connectors.py` | Created — `resolve_secrets`, `redact`, `guard_ssrf` |
| `agent_workforce/test_server.py` | Modified — added `connectors` import and `ConnectorTest` class (11 tests) |

## Deviations

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Minor — caught by qualify, no scope creep |
| Scope additions | 0 | None |
| Deferred | 0 | (redirect-chain SSRF deferral was logged during PLAN/AUDIT, not APPLY) |

**Total impact:** One qualify-caught bug fix; plan executed as specified otherwise.

### Auto-fixed Issues

**1. `guard_ssrf` returned duplicate addresses**

- **Found during:** Task 2 qualify (AC-5 test failure)
- **Issue:** `socket.getaddrinfo` returns one result per socket type (TCP/UDP/etc.), so the same IP address appeared multiple times in the returned list
- **Fix:** Skip addresses already collected before appending
- **Files:** `agent_workforce/connectors.py`
- **Verification:** `test_guard_ssrf_allows_public_target` now asserts a single-element list; full suite re-run, 79/79 pass

## Issues Encountered

None beyond the auto-fixed item above.

## Next Phase Readiness

**Ready:**
- `connectors.py` is complete, tested, and stdlib-only — Phase 3 can import `resolve_secrets`, `redact`, `guard_ssrf` directly
- `guard_ssrf`'s returned address list is the contract Phase 3 must use to avoid re-resolving DNS

**Concerns:**
- SSRF protection against redirect chains is not yet implemented — Phase 3 (which adds the actual HTTP client) must call `guard_ssrf` on every redirect hop, not just the initial URL (documented in `02-01-PLAN.md` boundaries)
- Phase 3 must call `redact()` before any resolved secret value reaches `jobs.record_event` or a persisted `job_events`/`jobs.output` row — this is a binding requirement, not optional (documented in `02-01-PLAN.md` boundaries)

**Blockers:** None

---
*Built with PAUL Framework v1.4 · https://chrisai.cv/skool · https://youtube.com/@chris-ai-systems*
*Phase: 02-secret-substitution-ssrf-guard, Plan: 01*
*Completed: 2026-09-22*
