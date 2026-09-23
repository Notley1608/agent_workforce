---
phase: 01-architecture-selection
topic: Architecture approach for a self-built, StarNet-style multi-agent orchestration platform
depth: standard
confidence: MEDIUM
created: 2026-09-22
---

# Discovery: Architecture approach for a self-built multi-agent orchestration platform

**Recommendation:** Option B — custom orchestrator built on existing reusable primitives (MCP for tools, OpenRouter/LiteLLM for model access, Docker for sandboxing, a cron lib for scheduling), not a framework and not a fork.

**Confidence:** MEDIUM — based on a full read of StarNet's own public documentation (single vendor source, current as of today) plus established, independently-verifiable facts about the underlying protocols/libraries (MCP, OpenRouter, Docker). No third-party or adversarial source cross-checked StarNet's own claims about itself.

## Objective

What we needed to learn before planning:
- Should the build start from StarNet's own MIT-licensed source, an existing multi-agent framework, or a from-scratch orchestrator built on standard primitives?
- Which subsystems are worth custom-building vs. reusing wholesale (model gateway, tool protocol, sandboxing, workflow routing, scheduling, autonomy control, secrets handling)?
- What is the minimum buildable core, and what should be deferred as presentation/gamification rather than architecture?

## Scope

**Include:**
- Multi-agent orchestration core: agent loop, tool/capability gating, delegation
- Tool integration protocol and sandboxed local execution
- Workflow routing between agents (sequential, filter/route, fan-out/fan-in, bounded loops)
- Scheduling and a bounded/leashed autonomy mode
- Model provider abstraction and cost ledger
- Secrets handling for agent-invoked API calls
- Messaging-channel remote control

**Exclude:**
- The 2D "station" game visual metaphor — treated as an optional cosmetic layer over real state, not core architecture
- StarNet's specific gamification (classes, XP, goals/quests) — motivational layer, not required for a functioning orchestrator
- Mobile native apps
- StarNet's pricing/credits product

## Findings

### Option A: Fork/extend StarNet directly

**Source:** github.com/androoAGI/starnet (MIT license, per starnetos.com/docs/help.html and migrating.html)

**Summary:** StarNet is open source. Its docs describe a Node.js sidecar (`npm start`, `localhost:8787`), MCP-based tool layer, Docker-isolated local tool execution ("Safe Cell"), and a conveyor-graph workflow engine — all inspectable and modifiable directly.

**Pros:**
- Working end-to-end system already exists; skips months of integration work
- Secret-substitution design, Safe Cell sandboxing, and the six-gate autonomy check are already solved and can be read as reference even if not reused directly
- Ships with 18 provider integrations, MCP catalog, and channel integrations already wired

**Cons:**
- Inherits the entire game/visual layer (station, props, classes, XP) as load-bearing UI even if unwanted — likely substantial rip-out cost
- Coupled to its own conventions (workspace layout, dossier model, recipe/skill formats) that may not match our actual use case
- Contributor/architecture unfamiliarity — modifying someone else's non-trivial codebase is slower per-change than building the specific slice we need

**For our use case:** Best if the goal is literally "run something StarNet-shaped" today. Weak fit if the goal is a minimal, purpose-built tool for a specific workflow — most of the codebase would be dead weight.

### Option B: Custom orchestrator on existing primitives

**Source:** Direct technical inference from MCP spec (modelcontextprotocol.io), OpenRouter/LiteLLM (public APIs), Docker SDKs — standard, independently documented technology, not StarNet-specific.

**Summary:** Reuse the protocols/services StarNet itself reuses rather than its code: MCP (`@modelcontextprotocol/sdk`) for tools, OpenRouter or LiteLLM as the model gateway, Docker (`dockerode`) for sandboxed local tool execution, a cron library for scheduling, OS keychain bindings for secrets. Write only the genuinely novel glue: capability gating, the routing-plan graph executor, the autonomy gate sequence, and the secret-substitution layer.

**Pros:**
- Every "build vs. reuse" decision favors reuse at the protocol layer, so the custom code surface is small (rough order: agent loop ~200 lines, capability gate ~trivial, secret substitution ~half a day, graph executor ~1 day, autonomy gates ~1 day)
- No inherited UI, gamification, or conventions we don't want
- MCP reuse means the tool ecosystem grows with the outside world, same benefit StarNet gets from it
- Matches the ladder principle already in use on this project: stdlib/native/existing-dependency before custom code

**Cons:**
- We rebuild integration surface (18 providers, N channels) that Option A gets for free — though OpenRouter alone covers the provider breadth in one integration
- No gamification/motivation layer unless we choose to add one later
- Design decisions (gate ordering, budget enforcement points, loop-cycle detection) have to be made and validated ourselves, even though StarNet's public docs describe reasonable defaults to start from

**For our use case:** Best fit if the goal is a lean tool tailored to an actual workflow, built and understood end-to-end by us, with the freedom to skip everything StarNet has that we don't need.

### Option C: Build on an existing multi-agent framework (LangGraph / CrewAI / AutoGen / similar)

**Source:** General knowledge of these frameworks' public documentation (not fetched in this session — flagged as an assumption below).

**Summary:** Use an existing agent-graph framework for the orchestration core (agent loop, state graph, delegation), and layer StarNet-style capability gating and an autonomy leash on top.

**Pros:**
- Orchestration primitives (graph execution, state passing, retries) already built and battle-tested
- Large community, examples, and pre-built integrations

**Cons:**
- Framework's own opinions/abstractions (state schema, node typing) often fight a workflow shape as specific as StarNet's filter/splitter/joiner/loop graph, requiring workarounds rather than clean fit
- Adds a dependency whose release cadence and breaking changes we don't control, for a graph executor that (per Option B's estimate) is genuinely about a day of code to own directly
- Framework lock-in risk: harder to swap out later than a protocol-level dependency like MCP

**For our use case:** Weak fit — the actual hard/valuable parts of this system (capability gating tied to explicit grants, gated autonomy with an audit ledger, secret substitution) are not what these frameworks solve; the part they do solve (graph execution) is small enough to own directly per Option B.

## Comparison

| Criteria | A: Fork StarNet | B: Custom on primitives | C: Existing framework |
|---|---|---|---|
| Time to first working agent | Fast (pre-built) | Fast (thin agent loop + MCP) | Medium (framework learning curve) |
| Control over architecture | Low (inherit their conventions) | High | Medium (framework's opinions apply) |
| Unwanted baggage (UI/gamification) | High | None | Low |
| Ecosystem reuse (tools) | High (MCP catalog inherited) | High (same MCP catalog, direct) | Medium (framework-specific integrations) |
| Long-term maintainability by us | Low (foreign codebase) | High (small, self-written core) | Medium (framework dependency risk) |
| Matches ladder principle (reuse > build) | Partial | Best fit | Partial |

## Recommendation

**Choose: Option B — custom orchestrator on existing primitives (MCP + model gateway + Docker + cron), with Option A's public docs used as a reference design, not as code to fork.**

**Rationale:**
The genuinely hard, valuable parts of a system like this — capability gating tied to explicit grants, a bounded/audited autonomy mode, secret substitution that never exposes keys to the model, a small workflow graph with loop-cycle refusal — are each small enough to write directly (day-scale, not month-scale) once the protocol-level reuse (MCP, a model gateway, Docker) is in place. Forking StarNet (Option A) trades that small build cost for a much larger unwanted-baggage cost (its UI/gamification layer). An existing multi-agent framework (Option C) solves a problem (graph execution) that turns out not to be the hard part, while adding a dependency on someone else's abstractions for the parts that are.

**Caveats:**
- If the actual goal turns out to be "run StarNet, lightly customized" rather than "build a purpose-fit tool," Option A becomes correct — revisit if scope shifts.
- This recommendation assumes a single-user, local-first tool. If multi-user/hosted is a real future requirement, several Option B design choices (OS-keychain secrets, Docker-per-agent sandbox, local SQLite/JSONL ledger) will need re-evaluation — see Open Questions.

## Open Questions

- Do we want any visual layer at all (dashboard vs. StarNet's spatial metaphor), or is this CLI/API-only? — Impact: low (doesn't change architecture, only the last build phase)
- Local-only single-user, or eventually hosted/multi-tenant? — Impact: high (changes the secrets model, sandbox-per-agent assumption, and the ledger's storage choice)
- Roll-your-own agent loop vs. adopt Claude Agent SDK for just that one piece (not the whole framework)? — Impact: medium (affects step 2 effort estimate, not overall architecture)
- Is Docker acceptable as a hard dependency for local tool sandboxing, or does the target environment forbid it? — Impact: medium (Safe-Cell-style isolation has no equally simple substitute)

## Quality Report

**Sources consulted:**
- starnetos.com/docs/ — all 22 pages (getting-started, providers, station, guides/crew, agents, guides/goals, guides/first-line, guides/conveyors, guides/filter, guides/splitter-joiner, guides/routines, skills, guides/night-shift, autonomy, connect-a-platform, guides/channels, connectors, migrating, help, troubleshooting, shortcuts, glossary) — fetched 2026-09-22

**Verification:**
- StarNet architecture, capability model, workflow engine, autonomy gates, secret-substitution design: read directly from vendor's own current documentation (primary source, not independently cross-verified against a third party)
- MCP, OpenRouter, Docker as viable reuse targets: general technical knowledge, not fetched/verified in this session

**Assumptions (not verified):**
- LangGraph/CrewAI/AutoGen characterization in Option C — not fetched this session; recommend a Level 1 (quick) discovery pass on the specific framework if Option C is reconsidered
- Effort estimates for custom components (agent loop ~200 lines, graph executor ~1 day, etc.) are rough engineering judgment, not measured

---
*Discovery completed: 2026-09-22*
*Confidence: MEDIUM*
*Ready for: /paul:plan 01-architecture-selection*
