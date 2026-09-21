"""Self-check for the job lifecycle: create agent -> assign task -> poll to completion/failure.

Run with: uv run python -m unittest agent_workforce.test_server
"""

import json
import tempfile
import threading
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

from . import automations, jobs, opportunities
from . import db
from . import providers
from . import planner
from .providers import ModelResult
from .server import app

client = TestClient(app)


def _wait_for_job(agent_id, job_id, timeout=5, statuses=("completed", "failed")):
    deadline = time.time() + timeout
    while time.time() < deadline:
        agent_jobs = client.get(f"/api/agents/{agent_id}/jobs").json()
        job = next(j for j in agent_jobs if j["id"] == job_id)
        if job["status"] in statuses:
            return job
        time.sleep(0.05)
    raise TimeoutError("job did not reach expected status")


def _wait_for_run(workflow_id, run_id, timeout=5):
    deadline = time.time() + timeout
    while time.time() < deadline:
        runs = client.get(f"/api/workflows/{workflow_id}/runs").json()
        run = next(r for r in runs if r["id"] == run_id)
        if run["status"] in ("completed", "failed"):
            return run
        time.sleep(0.05)
    raise TimeoutError("run did not finish")


class JobLifecycleTest(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        db.DB_PATH = Path(self.tmpdir.name) / "test.db"

    def tearDown(self):
        self.tmpdir.cleanup()

    def test_successful_task_execution(self):
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: ModelResult(
            f"echo: {prompt}", 10, 5
        )

        agent = client.post(
            "/api/agents", json={"name": "Ada", "role": "Researcher"}
        ).json()
        self.assertEqual(agent["status"], "idle")

        job_id = client.post(
            f"/api/agents/{agent['id']}/tasks", json={"input": "find competitors"}
        ).json()["job_id"]

        job = _wait_for_job(agent["id"], job_id)
        self.assertEqual(job["status"], "completed")
        self.assertEqual(job["output"], "echo: find competitors")
        self.assertEqual(job["input_tokens"], 10)

        agent_after = client.get(f"/api/agents/{agent['id']}").json()
        self.assertEqual(agent_after["status"], "idle")

    def test_job_timeline_records_execution_events(self):
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: ModelResult(
            "ok", 1, 1, tools_used=["web search: competitors"]
        )
        agent = client.post("/api/agents", json={"name": "Kai", "role": "Researcher"}).json()
        job_id = client.post(f"/api/agents/{agent['id']}/tasks", json={"input": "x"}).json()["job_id"]
        _wait_for_job(agent["id"], job_id)

        timeline = client.get(f"/api/jobs/{job_id}/timeline").json()
        labels = [e["label"] for e in timeline]
        self.assertEqual(labels[0], "Started")
        self.assertIn("Used tool: web search: competitors", labels)
        self.assertEqual(labels[-1], "Completed")

    def test_model_failure_marks_job_failed(self):
        def boom(model, system, prompt, capabilities):
            raise RuntimeError("provider unreachable")

        providers.PROVIDERS["groq"] = boom

        agent = client.post("/api/agents", json={"name": "Bo", "role": "Engineer"}).json()
        job_id = client.post(
            f"/api/agents/{agent['id']}/tasks", json={"input": "do a thing"}
        ).json()["job_id"]

        job = _wait_for_job(agent["id"], job_id)
        self.assertEqual(job["status"], "failed")
        self.assertIn("provider unreachable", job["error"])

    def test_cannot_assign_task_while_agent_working(self):
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: (
            time.sleep(0.3) or ModelResult("done", 1, 1)
        )

        agent = client.post("/api/agents", json={"name": "Cy", "role": "Writer"}).json()
        client.post(f"/api/agents/{agent['id']}/tasks", json={"input": "task 1"})
        time.sleep(0.1)

        resp = client.post(f"/api/agents/{agent['id']}/tasks", json={"input": "task 2"})
        self.assertEqual(resp.status_code, 409)

    def test_multiple_agents_run_concurrently(self):
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: (
            time.sleep(0.5) or ModelResult(f"echo: {prompt}", 1, 1)
        )

        agent_ids = [
            client.post("/api/agents", json={"name": f"Agent{i}", "role": "Researcher"}).json()["id"]
            for i in range(4)
        ]

        start = time.time()
        job_ids = [
            client.post(f"/api/agents/{aid}/tasks", json={"input": "go"}).json()["job_id"]
            for aid in agent_ids
        ]
        for aid, jid in zip(agent_ids, job_ids):
            job = _wait_for_job(aid, jid, timeout=3)
            self.assertEqual(job["status"], "completed")
        elapsed = time.time() - start

        # 4 jobs at 0.5s each: serialized would take ~2s, concurrent ~0.5-1s.
        self.assertLess(elapsed, 1.5)

    def test_web_capability_only_reaches_provider_when_installed(self):
        seen_capabilities = []
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: (
            seen_capabilities.append(capabilities) or ModelResult("ok", 1, 1)
        )
        agent = client.post("/api/agents", json={"name": "Di", "role": "Researcher"}).json()

        job_id = client.post(f"/api/agents/{agent['id']}/tasks", json={"input": "x"}).json()["job_id"]
        _wait_for_job(agent["id"], job_id)
        self.assertNotIn("web", seen_capabilities[-1])

        client.post("/api/infrastructure/web/toggle")
        job_id = client.post(f"/api/agents/{agent['id']}/tasks", json={"input": "x"}).json()["job_id"]
        _wait_for_job(agent["id"], job_id)
        self.assertIn("web", seen_capabilities[-1])

    def test_completed_job_gets_a_cost_estimate(self):
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: ModelResult(
            "ok", 1_000_000, 1_000_000
        )
        agent = client.post(
            "/api/agents", json={"name": "El", "role": "Researcher", "model": "openai/gpt-oss-120b"}
        ).json()
        job_id = client.post(f"/api/agents/{agent['id']}/tasks", json={"input": "x"}).json()["job_id"]
        job = _wait_for_job(agent["id"], job_id)
        self.assertAlmostEqual(job["cost"], 0.15 + 0.75)

    def test_workflow_chains_output_into_next_step(self):
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: ModelResult(
            f"{model}-processed({prompt})", 1, 1
        )
        researcher = client.post("/api/agents", json={"name": "Fi", "role": "Researcher"}).json()
        writer = client.post("/api/agents", json={"name": "Gi", "role": "Writer"}).json()

        workflow = client.post(
            "/api/workflows",
            json={"name": "Research then write", "agent_ids": [researcher["id"], writer["id"]]},
        ).json()
        self.assertEqual(len(workflow["agent_ids"]), 2)

        run = client.post(f"/api/workflows/{workflow['id']}/run", json={"input": "topic"}).json()
        finished = _wait_for_run(workflow["id"], run["run_id"])

        self.assertEqual(finished["status"], "completed")
        self.assertEqual(len(finished["steps"]), 2)
        self.assertEqual(finished["steps"][0]["input"], "topic")
        self.assertEqual(finished["steps"][0]["output"], "openai/gpt-oss-120b-processed(topic)")
        self.assertEqual(
            finished["steps"][1]["input"], "openai/gpt-oss-120b-processed(topic)"
        )
        self.assertEqual(finished["steps"][1]["agent_name"], "Gi")

    def test_workflow_run_fails_when_a_step_fails(self):
        def boom(model, system, prompt, capabilities):
            raise RuntimeError("step blew up")

        providers.PROVIDERS["groq"] = boom
        agent = client.post("/api/agents", json={"name": "Ha", "role": "Researcher"}).json()
        workflow = client.post(
            "/api/workflows", json={"name": "One step", "agent_ids": [agent["id"]]}
        ).json()

        run = client.post(f"/api/workflows/{workflow['id']}/run", json={"input": "topic"}).json()
        finished = _wait_for_run(workflow["id"], run["run_id"])
        self.assertEqual(finished["status"], "failed")
        self.assertEqual(finished["steps"][0]["status"], "failed")

    def test_step_failure_can_be_retried_and_then_succeed(self):
        calls = {"n": 0}

        def flaky(model, system, prompt, capabilities):
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("rate limited")
            return ModelResult("ok", 1, 1)

        providers.PROVIDERS["groq"] = flaky
        agent = client.post("/api/agents", json={"name": "Ret", "role": "Researcher"}).json()
        workflow = client.post("/api/workflows", json={"name": "Retry test", "agent_ids": [agent["id"]]}).json()

        with patch.object(planner, "decide_recovery", return_value={"action": "retry", "reason": "transient"}):
            run = client.post(f"/api/workflows/{workflow['id']}/run", json={"input": "topic"}).json()
            finished = _wait_for_run(workflow["id"], run["run_id"])

        self.assertEqual(finished["status"], "completed")
        self.assertEqual(len(finished["steps"]), 2)
        self.assertEqual(finished["steps"][0]["status"], "failed")
        self.assertEqual(finished["steps"][1]["status"], "completed")

        timeline = client.get(f"/api/jobs/{finished['steps'][0]['id']}/timeline").json()
        self.assertTrue(any("Recovery: retry" in e["label"] for e in timeline))

    def test_step_failure_can_be_skipped_and_pipeline_continues(self):
        def selective(model, system, prompt, capabilities):
            if prompt == "topic":
                raise RuntimeError("bad request")
            return ModelResult(f"processed({prompt})", 1, 1)

        providers.PROVIDERS["groq"] = selective
        researcher = client.post("/api/agents", json={"name": "Sk", "role": "Researcher"}).json()
        writer = client.post("/api/agents", json={"name": "Wr", "role": "Writer"}).json()
        workflow = client.post(
            "/api/workflows", json={"name": "Skip test", "agent_ids": [researcher["id"], writer["id"]]}
        ).json()

        with patch.object(planner, "decide_recovery", return_value={"action": "skip", "reason": "not essential"}):
            run = client.post(f"/api/workflows/{workflow['id']}/run", json={"input": "topic"}).json()
            finished = _wait_for_run(workflow["id"], run["run_id"])

        self.assertEqual(finished["status"], "completed")
        self.assertEqual(finished["steps"][0]["status"], "failed")
        self.assertEqual(finished["steps"][1]["status"], "completed")
        self.assertIn("skipped after failure", finished["steps"][1]["input"])

    def test_step_retries_are_capped(self):
        def boom(model, system, prompt, capabilities):
            raise RuntimeError("always fails")

        providers.PROVIDERS["groq"] = boom
        agent = client.post("/api/agents", json={"name": "Cap", "role": "Researcher"}).json()
        workflow = client.post("/api/workflows", json={"name": "Cap test", "agent_ids": [agent["id"]]}).json()

        with patch.object(planner, "decide_recovery", return_value={"action": "retry", "reason": "keep trying"}):
            run = client.post(f"/api/workflows/{workflow['id']}/run", json={"input": "topic"}).json()
            finished = _wait_for_run(workflow["id"], run["run_id"])

        self.assertEqual(finished["status"], "failed")
        self.assertEqual(len(finished["steps"]), 2)

    def test_files_capability_pauses_job_until_approved(self):
        outdir = Path(self.tmpdir.name) / "outputs"
        jobs.OUTPUT_DIR = outdir
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: ModelResult("hello", 1, 1)
        client.post("/api/infrastructure/files/toggle")

        agent = client.post("/api/agents", json={"name": "Fi", "role": "Writer"}).json()
        job_id = client.post(f"/api/agents/{agent['id']}/tasks", json={"input": "x"}).json()["job_id"]
        job = _wait_for_job(agent["id"], job_id, statuses=("awaiting_approval", "completed", "failed"))
        self.assertEqual(job["status"], "awaiting_approval")
        self.assertEqual(job["output"], "hello")
        self.assertFalse((outdir / f"{job_id}.txt").exists())

        approve = client.post(f"/api/jobs/{job_id}/approve")
        self.assertEqual(approve.status_code, 200)
        self.assertEqual((outdir / f"{job_id}.txt").read_text(), "hello")
        job_after = _wait_for_job(agent["id"], job_id)
        self.assertEqual(job_after["status"], "completed")

    def test_rejecting_a_files_job_fails_it_without_writing(self):
        outdir = Path(self.tmpdir.name) / "outputs"
        jobs.OUTPUT_DIR = outdir
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: ModelResult("hello", 1, 1)
        client.post("/api/infrastructure/files/toggle")

        agent = client.post("/api/agents", json={"name": "Re", "role": "Writer"}).json()
        job_id = client.post(f"/api/agents/{agent['id']}/tasks", json={"input": "x"}).json()["job_id"]
        _wait_for_job(agent["id"], job_id, statuses=("awaiting_approval",))

        reject = client.post(f"/api/jobs/{job_id}/reject")
        self.assertEqual(reject.status_code, 200)
        job_after = _wait_for_job(agent["id"], job_id)
        self.assertEqual(job_after["status"], "failed")
        self.assertIn("rejected by human", job_after["error"])
        self.assertFalse((outdir / f"{job_id}.txt").exists())

    def test_workflow_step_needing_files_pauses_run_until_approved(self):
        jobs.OUTPUT_DIR = Path(self.tmpdir.name) / "outputs"
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: ModelResult(
            f"processed({prompt})", 1, 1
        )
        client.post("/api/infrastructure/files/toggle")

        writer = client.post("/api/agents", json={"name": "Wr2", "role": "Writer"}).json()
        analyst = client.post("/api/agents", json={"name": "An2", "role": "Analyst"}).json()
        workflow = client.post(
            "/api/workflows", json={"name": "Files wf", "agent_ids": [writer["id"], analyst["id"]]}
        ).json()

        run = client.post(f"/api/workflows/{workflow['id']}/run", json={"input": "topic"}).json()
        run_id = run["run_id"]

        deadline = time.time() + 5
        while time.time() < deadline:
            runs = client.get(f"/api/workflows/{workflow['id']}/runs").json()
            current = next(r for r in runs if r["id"] == run_id)
            if current["steps"][0]["status"] == "awaiting_approval":
                break
            time.sleep(0.05)
        else:
            self.fail("step never reached awaiting_approval")
        self.assertEqual(current["status"], "running")  # run is paused, not failed

        client.post(f"/api/jobs/{current['steps'][0]['id']}/approve")

        deadline = time.time() + 5
        while time.time() < deadline:
            runs = client.get(f"/api/workflows/{workflow['id']}/runs").json()
            current = next(r for r in runs if r["id"] == run_id)
            if len(current["steps"]) == 2 and current["steps"][1]["status"] == "awaiting_approval":
                break
            time.sleep(0.05)
        else:
            self.fail("second step never reached awaiting_approval")

        client.post(f"/api/jobs/{current['steps'][1]['id']}/approve")
        finished = _wait_for_run(workflow["id"], run_id)
        self.assertEqual(finished["status"], "completed")
        self.assertEqual(finished["steps"][1]["output"], "processed(processed(topic))")

    def test_terminal_capability_pauses_then_runs_command_on_approval(self):
        jobs.TERMINAL_WORKDIR = Path(self.tmpdir.name) / "workspace"
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: ModelResult(
            "echo hello-terminal", 1, 1
        )
        client.post("/api/infrastructure/terminal/toggle")

        agent = client.post("/api/agents", json={"name": "Term", "role": "Engineer"}).json()
        job_id = client.post(f"/api/agents/{agent['id']}/tasks", json={"input": "x"}).json()["job_id"]
        job = _wait_for_job(agent["id"], job_id, statuses=("awaiting_approval",))
        self.assertEqual(job["output"], "echo hello-terminal")

        approve = client.post(f"/api/jobs/{job_id}/approve")
        self.assertEqual(approve.status_code, 200)
        job_after = _wait_for_job(agent["id"], job_id)
        self.assertEqual(job_after["status"], "completed")
        self.assertEqual(job_after["output"], "hello-terminal")

    def test_automation_skips_run_when_over_daily_budget(self):
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: ModelResult(
            "ok", 1_000_000, 1_000_000
        )
        agent = client.post("/api/agents", json={"name": "Jo", "role": "Researcher"}).json()
        workflow = client.post(
            "/api/workflows", json={"name": "Solo", "agent_ids": [agent["id"]]}
        ).json()
        automation = client.post(
            f"/api/workflows/{workflow['id']}/automations",
            json={"schedule_type": "interval", "interval_minutes": 5, "input": "go"},
        ).json()
        conn = db.get_conn()
        conn.execute("UPDATE automations SET next_run_at = ? WHERE id = ?", (db.now(), automation["id"]))
        conn.commit()
        conn.close()

        client.post("/api/settings", json={"daily_limit": 0})
        triggered = []
        automations.run_due_automations(lambda wf_id, text: triggered.append((wf_id, text)))
        self.assertEqual(triggered, [])
        automation_after = client.get(f"/api/workflows/{workflow['id']}/automations").json()[0]
        self.assertEqual(automation_after["last_run_status"], "skipped_budget")
        self.assertGreater(automation_after["next_run_at"], automation["next_run_at"])

        client.post("/api/settings", json={"daily_limit": None})
        conn = db.get_conn()
        conn.execute("UPDATE automations SET next_run_at = ? WHERE id = ?", (db.now(), automation["id"]))
        conn.commit()
        conn.close()
        automations.run_due_automations(lambda wf_id, text: triggered.append((wf_id, text)))
        self.assertEqual(triggered, [(workflow["id"], "go")])

    def test_activity_feed_lists_recent_events_newest_first(self):
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: ModelResult("ok", 1, 1)
        agent = client.post("/api/agents", json={"name": "Ky", "role": "Researcher"}).json()
        job_id = client.post(f"/api/agents/{agent['id']}/tasks", json={"input": "x"}).json()["job_id"]
        _wait_for_job(agent["id"], job_id)

        activity = client.get("/api/activity").json()
        labels = [a["label"] for a in activity]
        self.assertIn("Ky joined the floor", labels)
        self.assertIn("Ky completed a task", labels)
        timestamps = [a["ts"] for a in activity]
        self.assertEqual(timestamps, sorted(timestamps, reverse=True))

    def test_cancel_marks_job_cancelled_and_discards_late_result(self):
        release = threading.Event()

        def slow(model, system, prompt, capabilities):
            release.wait(timeout=3)
            return ModelResult("too late", 1, 1)

        providers.PROVIDERS["groq"] = slow
        agent = client.post("/api/agents", json={"name": "Lo", "role": "Researcher"}).json()
        job_id = client.post(f"/api/agents/{agent['id']}/tasks", json={"input": "x"}).json()["job_id"]
        time.sleep(0.1)

        cancelled = client.post(f"/api/jobs/{job_id}/cancel").json()
        self.assertEqual(cancelled["status"], "cancelled")

        resp = client.post(f"/api/jobs/{job_id}/cancel")
        self.assertEqual(resp.status_code, 409)

        release.set()
        time.sleep(0.2)
        job = client.get(f"/api/agents/{agent['id']}/jobs").json()[0]
        self.assertEqual(job["status"], "cancelled")
        self.assertIsNone(job["output"])

    def test_usage_totals_cost_across_jobs(self):
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: ModelResult(
            "ok", 1_000_000, 1_000_000
        )
        agent = client.post(
            "/api/agents", json={"name": "Ib", "role": "Researcher", "model": "openai/gpt-oss-120b"}
        ).json()
        job_id = client.post(f"/api/agents/{agent['id']}/tasks", json={"input": "x"}).json()["job_id"]
        _wait_for_job(agent["id"], job_id)

        usage = client.get("/api/usage").json()
        self.assertAlmostEqual(usage["total_cost"], 0.90)
        self.assertEqual(usage["total_jobs"], 1)


class GroqProviderTest(unittest.TestCase):
    def test_run_groq_returns_text_and_token_usage(self):
        seen_messages = {}

        def fake_create(**kwargs):
            seen_messages.update(kwargs)
            message = SimpleNamespace(content="hi there")
            choice = SimpleNamespace(message=message)
            usage = SimpleNamespace(prompt_tokens=3, completion_tokens=2)
            return SimpleNamespace(choices=[choice], usage=usage)

        fake_client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=fake_create)))
        with patch.object(providers, "Groq", return_value=fake_client):
            result = providers._run_groq("llama-3.3-70b-versatile", "be nice", "hello", set())

        self.assertEqual(result.text, "hi there")
        self.assertEqual((result.input_tokens, result.output_tokens), (3, 2))
        self.assertEqual(seen_messages["messages"][0], {"role": "system", "content": "be nice"})

    def test_run_groq_skips_system_message_when_blank(self):
        seen_messages = {}

        def fake_create(**kwargs):
            seen_messages.update(kwargs)
            message = SimpleNamespace(content="ok")
            usage = SimpleNamespace(prompt_tokens=1, completion_tokens=1)
            return SimpleNamespace(choices=[SimpleNamespace(message=message)], usage=usage)

        fake_client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=fake_create)))
        with patch.object(providers, "Groq", return_value=fake_client):
            providers._run_groq("llama-3.3-70b-versatile", "", "hello", set())
        self.assertEqual(len(seen_messages["messages"]), 1)

    def test_run_groq_reports_compound_web_search(self):
        tool = SimpleNamespace(type="search", arguments=json.dumps({"query": "today's date"}))
        message = SimpleNamespace(content="it's 2026", executed_tools=[tool])
        usage = SimpleNamespace(prompt_tokens=5, completion_tokens=4)
        fake_create = lambda **kwargs: SimpleNamespace(choices=[SimpleNamespace(message=message)], usage=usage)
        fake_client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=fake_create)))
        with patch.object(providers, "Groq", return_value=fake_client):
            result = providers._run_groq("groq/compound", "", "what's today's date?", {"web"})
        self.assertEqual(result.tools_used, ["web search: today's date"])


def _fake_plan_response(steps, summary="Do the thing."):
    return ModelResult(json.dumps({"summary": summary, "steps": steps}), 5, 5)


class PlannerTest(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        db.DB_PATH = Path(self.tmpdir.name) / "test.db"

    def tearDown(self):
        self.tmpdir.cleanup()

    def test_propose_plan_creates_a_pending_plan(self):
        step = {
            "name": "Researcher",
            "role": "Researcher",
            "provider": "groq",
            "model": "openai/gpt-oss-120b",
            "capabilities": [],
            "instructions": "Research competitors.",
        }
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: _fake_plan_response([step])

        plan = client.post("/api/plans", json={"objective": "Monitor competitors weekly"}).json()
        self.assertEqual(plan["status"], "proposed")
        self.assertEqual(len(plan["steps"]), 1)
        self.assertEqual(plan["warnings"], [])

    def test_propose_plan_warns_about_disabled_capability(self):
        step = {
            "name": "Researcher",
            "role": "Researcher",
            "provider": "groq",
            "model": "openai/gpt-oss-120b",
            "capabilities": ["web"],
            "instructions": "Research competitors.",
        }
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: _fake_plan_response([step])

        plan = client.post("/api/plans", json={"objective": "Monitor competitors weekly"}).json()
        self.assertEqual(len(plan["warnings"]), 1)
        self.assertIn("web", plan["warnings"][0])

    def test_propose_plan_always_uses_groq_regardless_of_model_output(self):
        step = {"name": "X", "role": "Researcher", "provider": "openai", "model": "gpt-4", "instructions": ""}
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: _fake_plan_response([step])

        plan = client.post("/api/plans", json={"objective": "Do a thing"}).json()
        self.assertEqual(plan["steps"][0]["provider"], "groq")
        self.assertEqual(plan["steps"][0]["model"], "openai/gpt-oss-120b")

    def test_propose_plan_uses_compound_model_for_web_steps(self):
        step = {"name": "X", "role": "Researcher", "capabilities": ["web"], "instructions": ""}
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: _fake_plan_response([step])

        plan = client.post("/api/plans", json={"objective": "Do a thing"}).json()
        self.assertEqual(plan["steps"][0]["model"], "groq/compound")

    def test_propose_plan_rejects_unparsable_output(self):
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: ModelResult(
            "not json", 1, 1
        )
        resp = client.post("/api/plans", json={"objective": "Do a thing"})
        self.assertEqual(resp.status_code, 502)

    def test_approve_plan_creates_agents_workflow_and_runs_it(self):
        step = {
            "name": "Researcher",
            "role": "Researcher",
            "provider": "groq",
            "model": "openai/gpt-oss-120b",
            "capabilities": [],
            "instructions": "Research competitors.",
        }
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: _fake_plan_response([step])

        plan = client.post("/api/plans", json={"objective": "Monitor competitors weekly"}).json()
        approval = client.post(f"/api/plans/{plan['id']}/approve").json()
        self.assertIn("workflow_id", approval)
        self.assertEqual(len(approval["agent_ids"]), 1)

        run = _wait_for_run(approval["workflow_id"], approval["run_id"])
        self.assertEqual(run["status"], "completed")

        agents_after = client.get("/api/agents").json()
        self.assertEqual(len(agents_after), 1)
        self.assertEqual(agents_after[0]["role"], "Researcher")

    def test_agent_cap_blocks_a_mission_that_would_exceed_it(self):
        step = {"name": "X", "role": "Researcher", "provider": "groq", "instructions": ""}
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: _fake_plan_response([step, step])
        plan = client.post("/api/plans", json={"objective": "Do two things"}).json()
        with patch.object(opportunities, "MAX_AGENTS", 1):
            approval = client.post(f"/api/plans/{plan['id']}/approve")
        self.assertEqual(approval.status_code, 403)
        self.assertEqual(client.get("/api/agents").json(), [])
        self.assertEqual(client.get("/api/plans").json()[0]["status"], "proposed")

    def test_cannot_approve_a_plan_twice(self):
        step = {"name": "X", "role": "Researcher", "provider": "groq", "instructions": ""}
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: _fake_plan_response([step])
        plan = client.post("/api/plans", json={"objective": "Do a thing"}).json()
        client.post(f"/api/plans/{plan['id']}/approve")
        second = client.post(f"/api/plans/{plan['id']}/approve")
        self.assertEqual(second.status_code, 409)

    def test_reject_plan_marks_it_rejected(self):
        step = {"name": "X", "role": "Researcher", "provider": "groq", "instructions": ""}
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: _fake_plan_response([step])
        plan = client.post("/api/plans", json={"objective": "Do a thing"}).json()
        reject = client.post(f"/api/plans/{plan['id']}/reject")
        self.assertEqual(reject.status_code, 200)
        approval_after_reject = client.post(f"/api/plans/{plan['id']}/approve")
        self.assertEqual(approval_after_reject.status_code, 409)


class RecoveryTest(unittest.TestCase):
    def test_decide_recovery_returns_the_parsed_decision(self):
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: ModelResult(
            json.dumps({"action": "retry", "reason": "looked transient"}), 1, 1
        )
        decision = planner.decide_recovery("objective", "Researcher", "429 rate limited")
        self.assertEqual(decision, {"action": "retry", "reason": "looked transient"})

    def test_decide_recovery_defaults_to_abort_on_invalid_action(self):
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: ModelResult(
            json.dumps({"action": "reboot", "reason": "nonsense"}), 1, 1
        )
        decision = planner.decide_recovery("objective", "Researcher", "boom")
        self.assertEqual(decision["action"], "abort")

    def test_decide_recovery_defaults_to_abort_on_unparsable_output(self):
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: ModelResult("not json", 1, 1)
        decision = planner.decide_recovery("objective", "Researcher", "boom")
        self.assertEqual(decision["action"], "abort")


class OpportunitiesTest(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        db.DB_PATH = Path(self.tmpdir.name) / "test.db"

    def tearDown(self):
        self.tmpdir.cleanup()

    def test_job_cost_is_recorded_on_the_ledger(self):
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: ModelResult(
            "ok", 1_000_000, 1_000_000
        )
        agent = client.post("/api/agents", json={"name": "Le", "role": "Researcher"}).json()
        job_id = client.post(f"/api/agents/{agent['id']}/tasks", json={"input": "x"}).json()["job_id"]
        _wait_for_job(agent["id"], job_id)

        ledger = client.get("/api/ledger").json()
        self.assertEqual(len(ledger["entries"]), 1)
        self.assertEqual(ledger["entries"][0]["kind"], "cost")
        self.assertLess(ledger["balance"], 0)

    def test_recovery_mode_blocks_new_single_agent_tasks(self):
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: ModelResult(
            "ok", 1_000_000, 1_000_000
        )
        client.post("/api/settings", json={"recovery_threshold": 0})
        agent = client.post("/api/agents", json={"name": "Ro", "role": "Researcher"}).json()
        job_id = client.post(f"/api/agents/{agent['id']}/tasks", json={"input": "x"}).json()["job_id"]
        _wait_for_job(agent["id"], job_id)  # first job pushes balance negative

        blocked = client.post(f"/api/agents/{agent['id']}/tasks", json={"input": "y"})
        self.assertEqual(blocked.status_code, 403)

    def test_recovery_mode_blocks_new_pipeline_runs(self):
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: ModelResult(
            "ok", 1_000_000, 1_000_000
        )
        client.post("/api/settings", json={"recovery_threshold": 0})
        agent = client.post("/api/agents", json={"name": "Sa", "role": "Researcher"}).json()
        workflow = client.post("/api/workflows", json={"name": "P", "agent_ids": [agent["id"]]}).json()
        run = client.post(f"/api/workflows/{workflow['id']}/run", json={"input": "x"}).json()
        _wait_for_run(workflow["id"], run["run_id"])  # pushes balance negative

        blocked = client.post(f"/api/workflows/{workflow['id']}/run", json={"input": "y"})
        self.assertEqual(blocked.status_code, 403)

    def test_recording_revenue_can_recover_balance(self):
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: ModelResult("ok", 1, 1)
        opp = client.post("/api/opportunities", json={"title": "Docs SaaS"}).json()
        agent = client.post("/api/agents", json={"name": "Ta", "role": "Researcher"}).json()
        job_id = client.post(f"/api/agents/{agent['id']}/tasks", json={"input": "x"}).json()["job_id"]
        _wait_for_job(agent["id"], job_id)

        client.post(f"/api/opportunities/{opp['id']}/revenue", json={"amount": 50, "note": "first sale"})
        ledger = client.get("/api/ledger").json()
        self.assertGreater(ledger["balance"], 0)

    def test_discover_opportunities_persists_orchestrator_ideas(self):
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: ModelResult(
            json.dumps({"opportunities": [{"title": "Docs SaaS", "description": "auto docs", "forecast_value": 500}]}),
            5, 5,
        )
        created = client.post("/api/opportunities/discover", json={"hint": "dev tools"}).json()
        self.assertEqual(len(created), 1)
        self.assertEqual(created[0]["status"], "discovered")
        listed = client.get("/api/opportunities").json()
        self.assertEqual(len(listed), 1)

    def test_opportunity_status_transitions_and_rejects_unknown_status(self):
        opp = client.post("/api/opportunities", json={"title": "X"}).json()
        updated = client.post(f"/api/opportunities/{opp['id']}/status", json={"status": "researching"}).json()
        self.assertEqual(updated["status"], "researching")

        bad = client.post(f"/api/opportunities/{opp['id']}/status", json={"status": "not-a-real-status"})
        self.assertEqual(bad.status_code, 400)

    def test_approving_a_plan_linked_to_an_opportunity_tracks_outcome(self):
        opp = client.post("/api/opportunities", json={"title": "Docs SaaS", "description": "auto docs"}).json()
        step = {
            "name": "Researcher", "role": "Researcher", "provider": "groq",
            "model": "openai/gpt-oss-120b", "capabilities": [], "instructions": "Research.",
        }
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: _fake_plan_response([step])
        plan = client.post("/api/plans", json={"objective": "auto docs", "opportunity_id": opp["id"]}).json()
        self.assertEqual(plan["opportunity_id"], opp["id"])

        approval = client.post(f"/api/plans/{plan['id']}/approve").json()
        _wait_for_run(approval["workflow_id"], approval["run_id"])

        opp_after = client.get(f"/api/opportunities/{opp['id']}").json()
        self.assertEqual(opp_after["workflow_id"], approval["workflow_id"])
        self.assertEqual(opp_after["status"], "success")

    def test_planner_created_researcher_defaults_to_web_only_capability(self):
        step = {
            "name": "Digger", "role": "Researcher", "provider": "groq",
            "model": "openai/gpt-oss-120b", "capabilities": [], "instructions": "Dig.",
        }
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: _fake_plan_response([step])
        plan = client.post("/api/plans", json={"objective": "dig"}).json()
        approval = client.post(f"/api/plans/{plan['id']}/approve").json()
        _wait_for_run(approval["workflow_id"], approval["run_id"])

        agent = client.get(f"/api/agents/{approval['agent_ids'][0]}").json()
        self.assertEqual(agent["role_type"], "researcher")
        self.assertEqual(json.loads(agent["capabilities_override"]), ["web"])

    def test_planner_created_worker_inherits_global_capabilities(self):
        step = {
            "name": "Builder", "role": "Engineer", "provider": "groq",
            "model": "openai/gpt-oss-120b", "capabilities": [], "instructions": "Build.",
        }
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: _fake_plan_response([step])
        plan = client.post("/api/plans", json={"objective": "build"}).json()
        approval = client.post(f"/api/plans/{plan['id']}/approve").json()
        _wait_for_run(approval["workflow_id"], approval["run_id"])

        agent = client.get(f"/api/agents/{approval['agent_ids'][0]}").json()
        self.assertEqual(agent["role_type"], "worker")
        self.assertIsNone(agent["capabilities_override"])

    def test_emergency_stop_blocks_new_single_agent_tasks(self):
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: ModelResult("ok", 1, 1)
        client.post("/api/settings", json={"emergency_stop": True})
        agent = client.post("/api/agents", json={"name": "Em", "role": "Researcher"}).json()

        blocked = client.post(f"/api/agents/{agent['id']}/tasks", json={"input": "x"})
        self.assertEqual(blocked.status_code, 403)

        client.post("/api/settings", json={"emergency_stop": False})
        allowed = client.post(f"/api/agents/{agent['id']}/tasks", json={"input": "x"})
        self.assertEqual(allowed.status_code, 200)

    def test_emergency_stop_blocks_new_pipeline_runs(self):
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: ModelResult("ok", 1, 1)
        agent = client.post("/api/agents", json={"name": "Fi", "role": "Researcher"}).json()
        workflow = client.post("/api/workflows", json={"name": "P", "agent_ids": [agent["id"]]}).json()
        client.post("/api/settings", json={"emergency_stop": True})

        blocked = client.post(f"/api/workflows/{workflow['id']}/run", json={"input": "x"})
        self.assertEqual(blocked.status_code, 403)

    def test_ledger_reports_operating_mode_not_just_raw_balance(self):
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: ModelResult("ok", 1, 1)
        agent = client.post("/api/agents", json={"name": "Mo", "role": "Researcher"}).json()
        job_id = client.post(f"/api/agents/{agent['id']}/tasks", json={"input": "x"}).json()["job_id"]
        _wait_for_job(agent["id"], job_id)  # pushes balance negative, but no threshold set yet

        ledger = client.get("/api/ledger").json()
        self.assertLess(ledger["balance"], 0)
        self.assertEqual(ledger["mode"], "running")
        self.assertFalse(ledger["recovery_mode"])

    def test_agent_list_includes_worker_profile_stats(self):
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: ModelResult("ok", 1, 1)
        agent = client.post("/api/agents", json={"name": "Pr", "role": "Researcher"}).json()
        job_id = client.post(f"/api/agents/{agent['id']}/tasks", json={"input": "x"}).json()["job_id"]
        _wait_for_job(agent["id"], job_id)

        listed = client.get("/api/agents").json()
        profile = next(a for a in listed if a["id"] == agent["id"])
        self.assertEqual(profile["jobs_done"], 1)
        self.assertEqual(profile["jobs_completed"], 1)
        self.assertGreater(profile["total_cost"], 0)

    def test_recording_a_learning_marks_a_finished_opportunity_learned(self):
        opp = client.post("/api/opportunities", json={"title": "X"}).json()
        client.post(f"/api/opportunities/{opp['id']}/status", json={"status": "success"})

        updated = client.post(f"/api/opportunities/{opp['id']}/notes", json={"note": "pricing was too low"}).json()
        self.assertEqual(updated["status"], "learned")
        self.assertEqual(updated["notes"], "pricing was too low")

    def test_discover_opportunities_includes_past_lessons_in_the_prompt(self):
        opp = client.post("/api/opportunities", json={"title": "Docs SaaS"}).json()
        client.post(f"/api/opportunities/{opp['id']}/status", json={"status": "failure"})
        client.post(f"/api/opportunities/{opp['id']}/notes", json={"note": "priced too high for the market"})

        seen_prompts = []

        def fake_groq(model, system, prompt, capabilities):
            seen_prompts.append(system)
            return ModelResult(json.dumps({"opportunities": [{"title": "New idea", "description": "d"}]}), 1, 1)

        providers.PROVIDERS["groq"] = fake_groq
        client.post("/api/opportunities/discover", json={"hint": ""})
        self.assertIn("priced too high for the market", seen_prompts[0])

    def test_ask_orchestrator_persists_the_conversation(self):
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: ModelResult(
            "You have $0 balance and no agents yet - hire a researcher first.", 5, 5
        )
        resp = client.post("/api/orchestrator/ask", json={"question": "What should I do first?"}).json()
        self.assertIn("researcher", resp["answer"])

        history = client.get("/api/orchestrator/messages").json()
        self.assertEqual(len(history), 2)
        self.assertEqual(history[0]["role"], "owner")
        self.assertEqual(history[0]["content"], "What should I do first?")
        self.assertEqual(history[1]["role"], "orchestrator")

    def test_propose_agent_returns_a_draft_without_creating_one(self):
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: ModelResult(
            json.dumps({"name": "Digger", "role": "Researcher", "instructions": "Dig deep."}), 5, 5
        )
        draft = client.post("/api/agents/propose", json={"brief": "find competitors"}).json()
        self.assertEqual(draft["name"], "Digger")
        self.assertEqual(draft["role_type"], "researcher")
        self.assertEqual(draft["capabilities_override"], ["web"])
        self.assertEqual(client.get("/api/agents").json(), [])

    def test_propose_agent_rejects_unusable_output(self):
        providers.PROVIDERS["groq"] = lambda model, system, prompt, capabilities: ModelResult("not json", 1, 1)
        resp = client.post("/api/agents/propose", json={"brief": "find competitors"})
        self.assertEqual(resp.status_code, 502)

    def test_creating_an_agent_with_capabilities_override_persists_it(self):
        agent = client.post(
            "/api/agents",
            json={"name": "Digger", "role": "Researcher", "role_type": "researcher", "capabilities_override": ["web"]},
        ).json()
        self.assertEqual(json.loads(agent["capabilities_override"]), ["web"])

    def test_agent_cap_blocks_recruiting_past_the_limit(self):
        with patch.object(opportunities, "MAX_AGENTS", 2):
            client.post("/api/agents", json={"name": "A", "role": "Researcher"})
            client.post("/api/agents", json={"name": "B", "role": "Researcher"})
            resp = client.post("/api/agents", json={"name": "C", "role": "Researcher"})
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(len(client.get("/api/agents").json()), 2)


if __name__ == "__main__":
    unittest.main()
