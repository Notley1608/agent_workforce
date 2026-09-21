# Crew

A local-first workspace where you recruit AI agents, give them desks, and hand them real tasks.

## Run

```
export GROQ_API_KEY=...       # required - every agent, including the planner, runs on Groq
uv run agent-workforce
```

Opens a browser window at `http://127.0.0.1:8420`. Data persists in `~/.agent_workforce/crew.db`.

## Test

```
uv run python -m unittest agent_workforce.test_server
```

## Status

Agents run real model calls (Groq) concurrently, with jobs as first-class data (status, cost, tool use, execution timeline, cancellation). Multi-agent pipelines chain agents together, can run on a schedule under a daily budget cap, and both single tasks and pipeline runs show up in an activity feed.

**Missions (autonomy loop):** instead of manually building a pipeline, give the workforce a plain-language objective ("+ New mission"). A planner model proposes a plan (which agents, providers, capabilities, and sequence), flags any capability it needs that isn't enabled yet, and only creates the agents/pipeline and runs it once you approve. Planning and execution reuse the same agents/pipelines machinery — approving a plan just creates a normal pipeline and runs it. Missions persist in a list so you can come back to a pending plan, or reopen a running/finished one's progress. If a step fails mid-run, a recovery model decides whether to retry (transient errors), skip (non-essential step), or abort (unrecoverable), instead of always killing the whole run — capped at one retry per step, with the reasoning recorded in that job's timeline. An approved mission can be run again straight from Mission Control with no re-planning or re-approval — a trusted routine, since the plan's already been vetted once.

**Risk gating:** capabilities with an effect outside the app aren't just executed unattended. The "Files" capability lets an agent write its output to disk, but a step that uses it pauses (`awaiting_approval`) right after the model call, before anything is written, and shows up with Approve/Reject controls in that step's run progress. Approving writes the file and lets the pipeline continue; rejecting fails the step and feeds into the same recovery flow as any other failure (retry/skip/abort).
