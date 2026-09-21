# Crew (agent_workforce)

Local-first workspace where the Owner recruits AI agents (Groq-backed), gives
them desks, and hands them real tasks. FastAPI backend + SQLite, React/Vite
frontend. Single-user, single-machine tool — not multi-tenant, no auth layer.

## Run / test

```
export GROQ_API_KEY=...              # required, every agent runs on Groq
uv run agent-workforce                # serves on http://127.0.0.1:8420
uv run python -m unittest agent_workforce.test_server
pnpm --dir frontend dev                # Vite dev server, proxies /api -> :8420
pnpm --dir frontend build              # writes frontend/dist, served by server.py
```

No `--reload` on the backend. After changing backend code, restart it before
verifying live:
```
pkill -f "agent-workforce"
nohup uv run agent-workforce > /tmp/agent_workforce_server.log 2>&1 & disown
```

## Architecture

- `agent_workforce/server.py` — wires routers, mounts `frontend/dist` as static files.
- `agent_workforce/routes/*.py` — one router per resource (agents, workflows, plans, opportunities, automations, workspace).
- `agent_workforce/jobs.py` — job execution: model calls off the event loop thread, risky-action gating, workflow chaining, the business self-directed loop.
- `agent_workforce/planner.py` — all model-driven decisions (plan proposal, agent proposal, failure recovery, business next-move) live here, not in routes.
- `agent_workforce/opportunities.py` — the Orchestrator's opportunity/ledger/recovery-mode logic.
- `agent_workforce/db.py` — one SQLite file (`~/.agent_workforce/crew.db`), stdlib only.
- `frontend/src/` — `app/` (routing/providers), `features/` (one dir per resource), `world/` (the 2.5D village scene), `lib/api/` (TanStack Query hooks), `lib/schemas/` (Zod, mirrors backend response shapes), `stores/` (Zustand — UI/world state only, never a copy of server data).

## Conventions (load-bearing — read before changing schema, agents, or jobs)

**Schema migrations.** New columns are added via `*_COLUMN_MIGRATIONS` dicts in
`db.py` (`JOB_COLUMN_MIGRATIONS`, `AGENT_COLUMN_MIGRATIONS`,
`PLAN_COLUMN_MIGRATIONS`, `OPPORTUNITY_COLUMN_MIGRATIONS`), applied in
`get_conn()` via `PRAGMA table_info` + `ALTER TABLE ADD COLUMN`. **Never** add
a column by editing the base `CREATE TABLE IF NOT EXISTS` string — that's a
no-op against the already-existing live DB file and the column silently
never reaches production.

**Only the Owner creates agents.** `POST /api/agents` (manual recruit) is the
only path that inserts a researcher/worker `agents` row. Missions
(`POST /api/plans/{id}/approve`) never create agents — they staff themselves
from the existing roster via `planner.assign_agents_and_workflow` (least-recently-used
agent per matching `role_type`), raising `WorkforceBlockedError` if none
exists. The one other exception is `POST /api/opportunities/{id}/create_business`,
which is itself an explicit Owner action that mints a Business Agent.

**Recruit cap.** `opportunities.MAX_AGENTS_BY_ROLE_TYPE` caps headcount per
`role_type` independently (`researcher`/`worker`/`business`). Retiring
(`DELETE /api/agents/{id}`) is the only way to free a slot; blocked with 409
while the agent is `working`. If live data ever exceeds a cap you're about
to introduce or lower, **flag the mismatch and ask** — don't silently bump
the cap to fit existing data.

**`WorkforceBlockedError`.** Gate functions in `opportunities.py` raise it;
route handlers catch it and convert to `HTTPException(403, str(exc))`. Used
for recruit caps, recovery mode, and emergency stop.

**Risky capabilities.** `files` and `terminal` have effects outside the app,
so a job that needs one pauses at `awaiting_approval` right after the model
call, before anything actually happens — Approve/Reject in `routes/agents.py`
(`approve_job`/`reject_job`) fires the real action or fails the job. Any new
capability with a real-world side effect (network access, publishing,
sending mail) must follow this same propose → human-approves-the-exact-action
→ fire pattern, not run unattended, unless explicitly told otherwise.

**Terminal sandbox.** `jobs._run_terminal_action` runs commands in a
throwaway Docker container: `--network none`, `--read-only` root, `--tmpfs
/tmp`, capped memory/pids, only the bind-mounted workdir writable. This is a
real jail (verified live — `--network none` genuinely blocks DNS/HTTP, not
just missing tools), not just a sandboxed cwd. Don't loosen it without
flagging the security tradeoff explicitly — it's the one thing stopping a
model-generated command from reaching the outside world.

**Business Agents (self-directed loop).** An `opportunities` row can become
a standing Business Agent via `create_business`: `business_agent_id` +
`budget` get set, status flips to `executing`, and `jobs._continue_business`
takes over — after every job resolves (success, failure, or a risky-action
resolution), `planner.decide_next_business_job` decides `job` (spawn the
next unit of work), `pause`, or `escalate` (needs Owner input), gated by the
opportunity's own `budget` vs. `opportunities.business_economics()`. This
replaces the fixed pre-planned `workflows` chain for businesses specifically;
missions/pipelines still use the static chain model unchanged.

**Ledger / recovery mode.** `opportunities.ensure_can_start_work` is the one
gate every new-work entry point (tasks, workflow runs, automations, business
jobs) calls before starting anything. `emergency_stop` and the recovery
threshold are safety nets — never bypass or loosen them as a shortcut past a
gate that's working as designed.

## Testing

`agent_workforce/test_server.py` — `unittest.TestCase`, fresh temp SQLite DB
per test (`setUp`/`tearDown` swapping `db.DB_PATH`), `providers.PROVIDERS["groq"]`
monkeypatched per test with a fake returning `ModelResult`, `TestClient(app)`
for HTTP-level tests. For anything that depends on the async
`ThreadPoolExecutor`-based job execution reaching a transient state (e.g.
`"working"`), sleep briefly inside the fake model function rather than
racing it — see `test_retiring_a_working_agent_is_blocked` for the pattern.

Run the full suite before calling backend work done. For anything that
touches execution/economics/sandboxing, also verify live against the real
running backend (`127.0.0.1:8420`) with real data — unit tests alone aren't
enough for this codebase's standing bar for "done."

## Working conventions for this project

- No fake agent activity, ever — every visible/backend state must reflect
  something that actually happened. This is a hard rule, not a style
  preference.
- Only commit to git when explicitly asked.
- Don't silently change a safety/cap value to make it fit live data or make
  an error go away — surface the conflict and ask.
- Deliberate simplifications get a `ponytail:`-style comment naming the cut
  corner and the upgrade path, not silent scope-narrowing.
