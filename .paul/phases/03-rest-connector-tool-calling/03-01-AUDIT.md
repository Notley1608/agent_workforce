---
phase: 03-rest-connector-tool-calling
plan: 01
type: Audit
about: "agent_workforce"
---

# Enterprise Audit: 03-01-PLAN.md

## 1. Executive Verdict

**Conditionally acceptable as drafted → enterprise-ready after applied
upgrades.**

The plan's core design is sound: it reuses the existing risky-capability
propose → approve → fire pattern with zero changes to `execute_job`,
`routes/agents.py`, or `planner.py`; it correctly closes the Phase-2-deferred
redirect-chain SSRF gap by re-running `guard_ssrf` on every hop and
connecting to the pre-validated address (not a re-resolved hostname); and it
carries forward the binding `redact()`-before-persistence requirement from
Phase 2's audit with an explicit, code-path-by-code-path accounting in Task
2. Two enterprise gaps were identified in the originally-drafted
`send_request` design — both now applied directly to the plan. One
functional (non-security) limitation is documented as an accepted,
explicitly-deferred scope cut.

## 2. What Is Solid

- **Redirect-chain SSRF closure (AC-2, AC-3):** `guard_ssrf` re-runs on
  every loop iteration, not just the initial URL, and the loop connects to
  the address `guard_ssrf` returned rather than letting the redirect
  handler re-resolve DNS — this is the exact TOCTOU gap Phase 2's audit
  flagged, closed correctly.
- **Scheme validation on every hop (AC-4):** the `http`/`https` check runs
  inside the loop, not just once before it — a redirect to a
  `file://`/`javascript:` target is caught, not just the entry URL.
- **Zero-touch integration surface:** the entire wiring into the existing
  risky-capability gate is one dict registration
  (`RISKY_ACTIONS["connector"] = _run_connector_action`) plus one new
  `SEED_INFRASTRUCTURE` row — no schema migration, no route change, no
  planner change. This is the correct reuse of existing machinery rather
  than a parallel system.
- **Failure-path exception coverage (AC-6):** `_run_connector_action`'s
  catch clause covers `ValueError` and `OSError`; `socket.timeout` and
  `ssl.SSLError` are both `OSError` subclasses, so the plan's existing
  catch is already complete without needing a broader `except Exception`.
- **Secret handling (AC-7):** every return path in Task 2 — success and
  every distinct failure mode — is required to pass through `redact()`
  before reaching `apply_risky_actions`'s return value, matching Phase 2's
  binding requirement. Error-path labels were traced and confirmed to
  never contain a resolved secret value in the first place (they carry
  only variable names or the model's own already-visible URL), so the
  `redact()` call there is correctly framed as defense in depth, not a
  gap-closer.
- **Disabled-by-default posture:** the new `connector` capability follows
  the same opt-in pattern as `terminal`/`files` — no behavior change for
  any existing agent until the Owner explicitly enables it.

## 3. Enterprise Gaps Identified

| # | Finding | Class | Risk if unaddressed |
|---|---------|-------|----------------------|
| 1 | `send_request` had no cap on response body size — `resp.read()` would buffer an entire response into memory regardless of size | Must-have | An external, not-fully-trusted API (or a compromised/misbehaving one) can exhaust memory on the single local server process — a self-inflicted DoS with no isolation boundary, since this is a single-process app with no per-request memory limit |
| 2 | No overall wall-clock ceiling on the connector-firing path across a redirect chain — only implicit per-socket timeouts existed | Strongly-recommended | `approve_job` fires risky actions synchronously on the request thread; `_run_terminal_action` already has `MAX_TERMINAL_SECONDS=30` for the equivalent case. Without an equivalent ceiling, a slow-but-not-malicious API combined with several redirects could tie up that thread for meaningfully longer than any other risky action is allowed to |
| 3 | UTF-8-with-`errors="replace"` decoding will corrupt non-text (binary) response bodies | Can-safely-defer | Functional limitation, not a security gap — REST/JSON APIs (the stated primary use case) are unaffected; only relevant if/when a connector target returns binary payloads |

**Ruled out after tracing the actual planned code** (not applied, not
findings): CRLF header injection (delegated to `http.client`'s own
internal validation), redirect-to-non-http(s)-scheme downgrade (already
caught by the in-loop scheme check on every iteration), exception coverage
gaps in Task 2's catch clause (`socket.timeout`/`ssl.SSLError` already
subclass `OSError`), and secret leakage via failure-path labels (traced and
confirmed those paths can only ever contain variable names or the model's
own URL, never a resolved secret value).

## 4. Upgrades Applied

### Must-Have (applied)

| Finding | Change |
|---------|--------|
| Unbounded response body read | Added AC-8; `send_request` now reads the body in chunks up to a `MAX_RESPONSE_BYTES = 1_000_000` cap, raising `ValueError` if exceeded, instead of a bare `resp.read()` |

### Strongly-Recommended (applied)

| Finding | Change |
|---------|--------|
| No overall timeout across redirects | Added AC-9; `send_request` now tracks `time.monotonic()` elapsed time against `MAX_CONNECTOR_SECONDS = 30` (mirroring `_run_terminal_action`'s `MAX_TERMINAL_SECONDS` precedent) at the top of every loop iteration, raising `ValueError` if exceeded |

### Deferred

| Finding | Reason | Tracking |
|---------|--------|----------|
| Binary response body corruption via `errors="replace"` decoding | Functional limitation, not a security gap; REST/JSON is the stated primary use case | Recorded in `<boundaries>` → SCOPE LIMITS as an explicit, accepted cut — revisit only if a connector target needs to return binary payloads |

## 5. Audit & Compliance Readiness

- **Secret hygiene:** enforced end-to-end per Phase 2's binding
  requirement — no code path in the plan can persist a raw secret value.
- **SSRF posture:** closed for both the initial request and every redirect
  hop, addressing the one item Phase 2 explicitly deferred.
- **Resource exhaustion posture:** now bounded on both axes that matter for
  a single-process local server — response size (AC-8) and elapsed time
  (AC-9) — consistent with the existing `_run_terminal_action` precedent
  for risky actions fired synchronously from `approve_job`.
- **Blast radius:** capability ships disabled by default; enabling it is
  an explicit Owner action via the existing infrastructure toggle, and
  firing a specific request still requires per-job Owner approval — no
  autonomous network egress is possible without two explicit human
  actions.

## 6. Final Release Bar

**Enterprise-ready after applied upgrades.** No further blocking findings.
Proceed to APPLY.

---
*Audit performed: 2026-09-24*
