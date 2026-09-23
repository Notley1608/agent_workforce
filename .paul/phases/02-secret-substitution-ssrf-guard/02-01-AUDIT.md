# Enterprise Plan Audit Report

**Plan:** .paul/phases/02-secret-substitution-ssrf-guard/02-01-PLAN.md
**Audited:** 2026-09-22
**Verdict:** Conditionally acceptable as drafted → enterprise-ready after applied upgrades

---

## 1. Executive Verdict

Conditionally acceptable as originally drafted. The plan's overall shape —
resolve secrets into headers only (never URLs), keep redaction separate
from resolution, make no outbound call in this phase — is the right
architecture for a security-critical primitive. But three gaps in the
security-critical paths (SSRF guard, secret resolution, redaction) were
release-blocking as written: each one is a way this module could look
correct in tests while still leaking a secret or letting a request reach
an internal address. All three have been applied to the plan below. With
those upgrades in place, I would sign off on this plan for its stated
scope (a standalone, unwired module — no outbound HTTP call yet).

## 2. What Is Solid

- **Refusing placeholders in URLs outright (AC-2)** rather than trying to
  sanitize or escape them — correct call. URL-embedded secrets leak via
  browser history, proxy logs, and the `Referer` header; there's no safe
  way to carry a secret in a URL, so refusing it entirely is the right
  posture, not a compromise.
- **Checking every resolved address from `getaddrinfo`, not just the
  first** — correctly handles a hostname that resolves to multiple
  A/AAAA records (a common SSRF-guard mistake is validating only the
  first address while the connection library picks a different one).
- **No outbound HTTP call in this phase** — keeps the security-critical
  primitive (secret resolution, redaction, SSRF check) unit-testable in
  isolation before it's wired to anything with a real network effect.
  This is the correct phase boundary for this milestone.

## 3. Enterprise Gaps Identified

- **SSRF guard gap:** `.is_unspecified` (`0.0.0.0` / `::`) was not checked
  by the original five predicates. Unspecified addresses can, on some
  platforms/configurations, reach services bound to localhost — a
  real, non-obvious SSRF bypass that a naive "block private ranges" list
  misses.
- **Silent-failure / audit-trail gap:** an env var that is *set but
  empty* would have been silently substituted as an empty string into an
  auth header. The resulting request would fail (or worse, succeed
  unauthenticated against a permissive endpoint) with no error raised and
  no record that the secret was never actually configured — exactly the
  kind of silent failure that doesn't survive post-incident
  reconstruction.
- **Redaction correctness gap:** no defined ordering for multi-value
  redaction. If one secret is a substring of another (plausible with
  prefixed/versioned API keys), redacting the shorter one first leaves a
  raw fragment of the longer secret sitting in what's supposed to be
  sanitized output.
- **TOCTOU / DNS-rebinding gap:** `guard_ssrf` validated an address but
  discarded it, meaning any future caller would re-resolve DNS at
  request time — an attacker who controls DNS could return a public
  address during the check and a private one at connection time. The
  plan gave no architectural guarantee against this.
- **Enforcement gap (not a code defect, a plan-completeness defect):**
  nothing in the plan bound future callers to actually use `redact()`
  before logging. A correct module can still be misused; the plan didn't
  say so anywhere a future implementer (Phase 3) would see it.

## 4. Upgrades Applied to Plan

### Must-Have (Release-Blocking)

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|----------------|
| 1 | `guard_ssrf` missing `.is_unspecified` check | Task 2 action, AC-6 (new) | Added `.is_unspecified` to the predicate list; added AC-6 |
| 2 | Empty-but-set secret silently substituted | Task 1 action, AC-7 (new) | `resolve_secrets` now raises `ValueError` on an empty resolved value; added AC-7 |
| 3 | `redact()` had no ordering guarantee for substring-overlapping secrets | Task 1 action, AC-8 (new) | `redact()` now sorts `secret_values` longest-first before substitution; added AC-8 |

### Strongly Recommended

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|----------------|
| 1 | `guard_ssrf` discarded the validated address, opening a TOCTOU/DNS-rebinding gap | Task 2 action, `<done>` | Return type changed `-> None` to `-> list[str]`; caller (Phase 3) must connect to the returned validated address rather than re-resolving |
| 2 | No plan-level requirement that future logging paths call `redact()` | New `<boundaries>` subsection "SECRET HANDLING" | Added explicit binding requirement on any future integration with `jobs.record_event`/persisted output |

### Deferred (Can Safely Defer)

| # | Finding | Rationale for Deferral |
|---|---------|----------------------|
| 1 | SSRF protection against redirect chains | No HTTP client exists yet in this plan's scope — nothing makes a request, so there's no redirect to protect against. Added as an explicit `SCOPE LIMITS` note so Phase 3's plan is written against it deliberately instead of it being silently forgotten. |

## 5. Audit & Compliance Readiness

- **Defensible audit evidence:** with AC-7 applied, a misconfigured secret
  now fails loudly and testably rather than producing a silently-broken
  request — this is what makes the failure mode reconstructable after the
  fact instead of showing up only as "the connector call didn't work."
- **Prevents silent failures:** the empty-secret and substring-redaction
  fixes directly close two silent-failure paths that existed in the
  original draft.
- **Post-incident reconstruction:** the `guard_ssrf` return-value change
  means the validated address is now available to whatever calls it next
  (Phase 3), which is what allows a future incident review to establish
  "the address that was checked is the address that was connected to" —
  without it, that link is only assumed, never verifiable.
- **Ownership/accountability:** this module is entirely internal to
  `agent_workforce`'s own codebase (no external service, no third-party
  processor of secrets), so there's no cross-org accountability gap to
  resolve at this phase.
- **Area that would fail a real audit if unaddressed:** the original
  empty-secret behavior — "the system had a credential configured, sort
  of, and made a request anyway" is exactly the kind of finding that
  fails a SOC2/ISO control review on authentication handling.

## 6. Final Release Bar

**What must be true before this plan ships:** all 8 acceptance criteria
(the original 5 plus AC-6/7/8 added by this audit) pass under
`uv run python -m unittest agent_workforce.test_server`, and
`connectors.py` remains unwired (imports nothing from `jobs.py` or
`routes/*`), per the existing boundaries.

**What risks remain if shipped as-is (post-upgrade):** none within this
plan's stated scope. The deferred redirect-chain SSRF risk is real but
correctly out of scope until Phase 3 introduces an actual HTTP client —
it is documented, not ignored.

**Sign-off:** Yes, I would sign off on this plan for its scope — a
standalone, unwired secret-resolution and SSRF-guard module — with the
must-have and strongly-recommended upgrades applied above.

---

**Summary:** Applied 3 must-have + 2 strongly-recommended upgrades. Deferred 1 item (documented in SCOPE LIMITS for Phase 3).
**Plan status:** Updated and ready for APPLY.

---
*Audit performed by PAUL Enterprise Audit Workflow*
*Audit template version: 1.0*
