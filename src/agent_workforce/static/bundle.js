"use strict";
(() => {
  // src/agent_workforce/static/ts/api.ts
  async function api(path, opts) {
    const res = await fetch(path, opts);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || res.statusText);
    }
    return res.json();
  }
  function jsonBody(data) {
    return {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    };
  }

  // src/agent_workforce/static/ts/activity.ts
  var feedEl = document.getElementById("activity-feed");
  async function refreshActivity() {
    const events = await api("/api/activity");
    if (events.length === 0) {
      feedEl.innerHTML = '<li class="empty-activity">Nothing yet. Activity shows up here as agents work.</li>';
      return;
    }
    feedEl.innerHTML = events.map(
      (e) => `<li><span class="activity-time">${new Date(e.ts * 1e3).toLocaleTimeString()}</span>${e.label}</li>`
    ).join("");
  }

  // src/agent_workforce/static/ts/timeline.ts
  async function fetchTimelineHtml(jobId) {
    const events = await api(`/api/jobs/${jobId}/timeline`);
    if (events.length === 0) return "";
    const items = events.map((e) => `<div>${new Date(e.created_at * 1e3).toLocaleTimeString()} \xB7 ${e.label}</div>`).join("");
    return `<div class="job-timeline">${items}</div>`;
  }

  // src/agent_workforce/static/ts/workspace.ts
  var infraEl = document.getElementById("infrastructure");
  var usageBadge = document.getElementById("usage-badge");
  var budgetInput = document.getElementById("budget-input");
  var recoveryInput = document.getElementById("recovery-input");
  var emergencyStopBtn = document.getElementById("emergency-stop-btn");
  async function refreshInfrastructure() {
    const items = await api("/api/infrastructure");
    infraEl.innerHTML = "";
    for (const item of items) {
      const btn = document.createElement("button");
      btn.className = "infra-toggle";
      btn.dataset.enabled = String(!!item.enabled);
      btn.innerHTML = `<span class="dot"></span>${item.label}`;
      btn.addEventListener("click", async () => {
        await api(`/api/infrastructure/${item.key}/toggle`, { method: "POST" });
        refreshInfrastructure();
      });
      infraEl.appendChild(btn);
    }
  }
  async function refreshUsage() {
    const usage = await api("/api/usage");
    usageBadge.textContent = `$${usage.today_cost.toFixed(4)} today`;
  }
  async function refreshSettings() {
    const settings = await api("/api/settings");
    budgetInput.value = settings.daily_spend_limit === null ? "" : String(settings.daily_spend_limit);
    recoveryInput.value = settings.recovery_threshold === null ? "" : String(settings.recovery_threshold);
    emergencyStopBtn.dataset.active = String(settings.emergency_stop);
    emergencyStopBtn.textContent = settings.emergency_stop ? "Resume work" : "Emergency stop";
  }
  function initWorkspace() {
    budgetInput.addEventListener("change", async () => {
      const daily_limit = budgetInput.value === "" ? null : Number(budgetInput.value);
      await api("/api/settings", jsonBody({ daily_limit }));
    });
    recoveryInput.addEventListener("change", async () => {
      const recovery_threshold = recoveryInput.value === "" ? null : Number(recoveryInput.value);
      await api("/api/settings", jsonBody({ recovery_threshold }));
    });
    emergencyStopBtn.addEventListener("click", async () => {
      const activating = emergencyStopBtn.dataset.active !== "true";
      if (activating && !confirm("Stop all new agent work until you resume?")) return;
      await api("/api/settings", jsonBody({ emergency_stop: activating }));
      await refreshSettings();
    });
    refreshSettings();
  }

  // src/agent_workforce/static/ts/agents.ts
  var floor = document.getElementById("floor");
  var recruitDialog = document.getElementById("recruit-dialog");
  var recruitForm = document.getElementById("recruit-form");
  var taskDialog = document.getElementById("task-dialog");
  var taskOutput = document.getElementById("task-output");
  var taskHistory = document.getElementById("task-history");
  var taskAbort = document.getElementById("task-abort");
  var agents = [];
  var selectedAgentId = null;
  var activeJobId = null;
  var pendingDraft = null;
  function getAgents() {
    return agents;
  }
  function agentName(id) {
    return agents.find((a) => a.id === id)?.name || "?";
  }
  function renderFloor() {
    floor.innerHTML = "";
    if (agents.length === 0) {
      floor.innerHTML = '<p class="empty-floor">No one on the floor yet. Recruit your first agent.</p>';
      return;
    }
    for (const agent of agents) {
      const desk = document.createElement("div");
      desk.className = "desk";
      desk.dataset.status = agent.status;
      const successRate = agent.jobs_done > 0 ? Math.round(agent.jobs_completed / agent.jobs_done * 100) : null;
      desk.innerHTML = `
      <div class="avatar">${agent.avatar}</div>
      <div class="name">${agent.name}</div>
      <div class="role">${agent.role}</div>
      <div class="status"><span class="dot"></span>${agent.status}</div>
      <div class="profile">${successRate === null ? "no jobs yet" : `${successRate}% success \xB7 ${agent.jobs_done} jobs`}</div>
    `;
      desk.addEventListener("click", () => openTaskDialog(agent));
      floor.appendChild(desk);
    }
  }
  async function refreshAgents() {
    agents = await api("/api/agents");
    renderFloor();
  }
  async function renderHistory(agentId) {
    const jobs = await api(`/api/agents/${agentId}/jobs`);
    taskHistory.innerHTML = "";
    for (const job of jobs) {
      const details = document.createElement("details");
      details.className = "history-item";
      details.dataset.status = job.status;
      const summary = document.createElement("summary");
      summary.textContent = `[${job.status}] ${job.input}`;
      details.appendChild(summary);
      details.addEventListener(
        "toggle",
        async () => {
          if (!details.open) return;
          const body = document.createElement("div");
          body.className = "history-item-body";
          body.textContent = job.output || job.error || "";
          body.insertAdjacentHTML("beforeend", await fetchTimelineHtml(job.id));
          details.appendChild(body);
        },
        { once: true }
      );
      taskHistory.appendChild(details);
    }
  }
  function openTaskDialog(agent) {
    selectedAgentId = agent.id;
    document.getElementById("task-dialog-title").textContent = `Assign a task to ${agent.name}`;
    taskOutput.textContent = "";
    taskOutput.className = "";
    taskAbort.hidden = true;
    renderHistory(agent.id);
    taskDialog.showModal();
  }
  async function pollJob(agentId, jobId) {
    activeJobId = jobId;
    taskAbort.hidden = false;
    for (; ; ) {
      const jobs = await api(`/api/agents/${agentId}/jobs`);
      const job = jobs.find((j) => j.id === jobId);
      if (job && job.status === "completed") {
        taskOutput.textContent = job.output;
        if (job.tools_used && job.tools_used.length) {
          const tools = document.createElement("div");
          tools.className = "tools-used";
          tools.textContent = job.tools_used.join(" \xB7 ");
          taskOutput.appendChild(tools);
        }
        taskOutput.insertAdjacentHTML("beforeend", await fetchTimelineHtml(job.id));
        activeJobId = null;
        taskAbort.hidden = true;
        await refreshAgents();
        await refreshUsage();
        await renderHistory(agentId);
        return;
      }
      if (job && (job.status === "failed" || job.status === "cancelled")) {
        taskOutput.textContent = job.status === "cancelled" ? "Cancelled." : job.error;
        taskOutput.className = "error";
        taskOutput.insertAdjacentHTML("beforeend", await fetchTimelineHtml(job.id));
        activeJobId = null;
        taskAbort.hidden = true;
        await refreshAgents();
        await refreshUsage();
        await renderHistory(agentId);
        return;
      }
      if (job && job.status === "awaiting_approval") {
        taskOutput.textContent = "";
        const pre = document.createElement("div");
        pre.textContent = job.output || "";
        taskOutput.appendChild(pre);
        const actions = document.createElement("div");
        actions.className = "actions";
        actions.innerHTML = `<button type="button" class="reject-risky">Reject</button>
                            <button type="button" class="approve-risky">Approve</button>`;
        actions.querySelector(".approve-risky").addEventListener("click", () => {
          api(`/api/jobs/${job.id}/approve`, { method: "POST" });
        });
        actions.querySelector(".reject-risky").addEventListener("click", () => {
          api(`/api/jobs/${job.id}/reject`, { method: "POST" });
        });
        taskOutput.appendChild(actions);
      }
      await new Promise((r) => setTimeout(r, 1e3));
    }
  }
  function initAgents() {
    const DEFAULT_MODELS = {
      groq: "openai/gpt-oss-120b"
    };
    const providerSelect = document.getElementById("recruit-provider");
    const modelInput = document.getElementById("recruit-model");
    providerSelect.addEventListener("change", () => {
      modelInput.value = DEFAULT_MODELS[providerSelect.value] || "";
    });
    document.getElementById("recruit-btn").addEventListener("click", () => {
      pendingDraft = null;
      recruitDialog.showModal();
    });
    document.getElementById("recruit-cancel").addEventListener("click", () => recruitDialog.close());
    recruitForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = new FormData(e.target);
      await api("/api/agents", jsonBody({
        name: form.get("name"),
        role: form.get("role"),
        role_type: pendingDraft?.role_type,
        capabilities_override: pendingDraft?.capabilities_override,
        avatar: form.get("avatar") || "\u{1F916}",
        provider: form.get("provider") || "groq",
        model: form.get("model") || "openai/gpt-oss-120b",
        instructions: form.get("instructions") || ""
      }));
      pendingDraft = null;
      e.target.reset();
      recruitDialog.close();
      await refreshAgents();
    });
    document.getElementById("build-agent-btn").addEventListener("click", async () => {
      const brief = prompt("What should this agent do?");
      if (!brief) return;
      const btn = document.getElementById("build-agent-btn");
      btn.textContent = "Thinking...";
      try {
        pendingDraft = await api("/api/agents/propose", jsonBody({ brief }));
        const form = recruitForm;
        form.elements.namedItem("name").value = pendingDraft.name;
        form.elements.namedItem("instructions").value = pendingDraft.instructions;
        const roleSelect = form.elements.namedItem("role");
        const match = [...roleSelect.options].find((o) => o.value.toLowerCase() === pendingDraft.role.toLowerCase());
        if (match) roleSelect.value = match.value;
        recruitDialog.showModal();
      } catch (err) {
        alert(err.message);
      } finally {
        btn.textContent = "\u{1F9ED} Orchestrator: build agent";
      }
    });
    document.getElementById("task-cancel").addEventListener("click", () => taskDialog.close());
    taskAbort.addEventListener("click", async () => {
      if (activeJobId) await api(`/api/jobs/${activeJobId}/cancel`, { method: "POST" });
    });
    document.getElementById("task-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = new FormData(e.target).get("input");
      taskOutput.textContent = "Working...";
      taskOutput.className = "";
      try {
        const { job_id } = await api(`/api/agents/${selectedAgentId}/tasks`, jsonBody({ input }));
        await refreshAgents();
        await pollJob(selectedAgentId, job_id);
      } catch (err) {
        taskOutput.textContent = err.message;
        taskOutput.className = "error";
      }
    });
  }

  // src/agent_workforce/static/ts/automationsPanel.ts
  var automationDialog = document.getElementById("automation-dialog");
  var automationList = document.getElementById("automation-list");
  var scheduleTypeSelect = document.getElementById("automation-schedule-type");
  var intervalField = document.getElementById("automation-interval-field");
  var dailyField = document.getElementById("automation-daily-field");
  var selectedWorkflowId = null;
  function describeAutomation(a) {
    const when = a.schedule_type === "interval" ? `every ${a.interval_minutes}m` : `daily at ${a.daily_at}`;
    const next = a.next_run_at ? new Date(a.next_run_at * 1e3).toLocaleString() : "-";
    const last = a.last_run_at ? `${a.last_run_status} @ ${new Date(a.last_run_at * 1e3).toLocaleString()}` : "never run";
    return { when, next, last };
  }
  async function refreshAutomationList(workflowId) {
    const items = await api(`/api/workflows/${workflowId}/automations`);
    automationList.innerHTML = "";
    for (const a of items) {
      const { when, next, last } = describeAutomation(a);
      const row = document.createElement("div");
      row.className = "automation-row";
      row.innerHTML = `
      <div>${when} \xB7 next ${next} \xB7 last: ${last}</div>
      <button class="automation-toggle">${a.enabled ? "Pause" : "Resume"}</button>
      <button class="automation-delete">Delete</button>
    `;
      row.querySelector(".automation-toggle").addEventListener("click", async () => {
        await api(`/api/automations/${a.id}/toggle`, { method: "POST" });
        refreshAutomationList(workflowId);
      });
      row.querySelector(".automation-delete").addEventListener("click", async () => {
        await api(`/api/automations/${a.id}`, { method: "DELETE" });
        refreshAutomationList(workflowId);
      });
      automationList.appendChild(row);
    }
  }
  function openAutomationDialog(pipeline) {
    selectedWorkflowId = pipeline.id;
    document.getElementById("automation-dialog-title").textContent = `Schedule "${pipeline.name}"`;
    refreshAutomationList(pipeline.id);
    automationDialog.showModal();
  }
  function initAutomationsPanel() {
    scheduleTypeSelect.addEventListener("change", () => {
      const daily = scheduleTypeSelect.value === "daily";
      intervalField.style.display = daily ? "none" : "";
      dailyField.style.display = daily ? "" : "none";
    });
    document.getElementById("automation-cancel").addEventListener("click", () => automationDialog.close());
    document.getElementById("automation-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = new FormData(e.target);
      const schedule_type = form.get("schedule_type");
      await api(`/api/workflows/${selectedWorkflowId}/automations`, jsonBody({
        schedule_type,
        interval_minutes: schedule_type === "interval" ? Number(form.get("interval_minutes")) : null,
        daily_at: schedule_type === "daily" ? form.get("daily_at") : null,
        input: form.get("input")
      }));
      e.target.reset();
      await refreshAutomationList(selectedWorkflowId);
    });
  }

  // src/agent_workforce/static/ts/pipelines.ts
  var pipelinesEl = document.getElementById("pipelines");
  var pipelineDialog = document.getElementById("pipeline-dialog");
  var pipelineStepsEl = document.getElementById("pipeline-steps");
  var pipelineRunDialog = document.getElementById("pipeline-run-dialog");
  var pipelineRunForm = document.getElementById("pipeline-run-form");
  var pipelineRunProgress = document.getElementById("pipeline-run-progress");
  var pipelineRunAbort = document.getElementById("pipeline-run-abort");
  var pipelines = [];
  var selectedPipelineId = null;
  var activeRun = null;
  function addPipelineStepRow() {
    const row = document.createElement("div");
    row.className = "pipeline-step-row";
    const options = getAgents().map((a) => `<option value="${a.id}">${a.name} (${a.role})</option>`).join("");
    row.innerHTML = `<select required>${options}</select><button type="button">remove</button>`;
    row.querySelector("button").addEventListener("click", () => row.remove());
    pipelineStepsEl.appendChild(row);
  }
  function renderPipelines() {
    pipelinesEl.innerHTML = "";
    if (pipelines.length === 0) {
      pipelinesEl.innerHTML = '<p class="empty-pipelines">No pipelines yet. Chain agents together with "+ New pipeline".</p>';
      return;
    }
    for (const p of pipelines) {
      const card = document.createElement("div");
      card.className = "pipeline-card";
      const chain = p.agent_ids.map((id) => `<span class="step">${agentName(id)}</span>`).join("<span>&rarr;</span>");
      card.innerHTML = `<div class="name">${p.name}</div><div class="pipeline-chain">${chain}</div><button class="run-pipeline">Run</button><button class="schedule-pipeline">Schedule</button>`;
      card.querySelector(".run-pipeline").addEventListener("click", () => openPipelineRunDialog(p));
      card.querySelector(".schedule-pipeline").addEventListener("click", () => openAutomationDialog(p));
      pipelinesEl.appendChild(card);
    }
  }
  async function refreshPipelines() {
    pipelines = await api("/api/workflows");
    renderPipelines();
  }
  function openPipelineRunDialog(pipeline) {
    selectedPipelineId = pipeline.id;
    document.getElementById("pipeline-run-title").textContent = `Run "${pipeline.name}"`;
    pipelineRunForm.hidden = false;
    pipelineRunProgress.innerHTML = "";
    pipelineRunAbort.hidden = true;
    activeRun = null;
    pipelineRunDialog.showModal();
  }
  function showRunProgress(title, workflowId, runId) {
    document.getElementById("pipeline-run-title").textContent = title;
    pipelineRunForm.hidden = true;
    pipelineRunProgress.innerHTML = "";
    pipelineRunAbort.hidden = true;
    activeRun = null;
    pipelineRunDialog.showModal();
    pollPipelineRun(workflowId, runId);
  }
  var timelineCache = /* @__PURE__ */ new Map();
  async function timelineHtmlFor(step) {
    if (step.status !== "completed" && step.status !== "failed" && step.status !== "cancelled") return "";
    let html = timelineCache.get(step.id);
    if (html === void 0) {
      html = await fetchTimelineHtml(step.id);
      timelineCache.set(step.id, html);
    }
    return html;
  }
  async function renderRunProgress(run) {
    pipelineRunProgress.innerHTML = "";
    for (const step of run.steps) {
      const el = document.createElement("div");
      el.className = "run-step";
      el.dataset.status = step.status;
      el.innerHTML = `
      <div class="run-step-head"><span>${step.agent_name}</span><span>${step.status}</span></div>
      <div class="run-step-output">${step.output || step.error || ""}</div>
    `;
      if (step.status === "awaiting_approval") {
        const actions = document.createElement("div");
        actions.className = "actions";
        actions.innerHTML = `<button type="button" class="reject-risky">Reject</button>
                            <button type="button" class="approve-risky">Approve</button>`;
        actions.querySelector(".approve-risky").addEventListener("click", () => {
          api(`/api/jobs/${step.id}/approve`, { method: "POST" });
        });
        actions.querySelector(".reject-risky").addEventListener("click", () => {
          api(`/api/jobs/${step.id}/reject`, { method: "POST" });
        });
        el.appendChild(actions);
      }
      el.insertAdjacentHTML("beforeend", await timelineHtmlFor(step));
      pipelineRunProgress.appendChild(el);
    }
  }
  async function pollPipelineRun(workflowId, runId) {
    for (; ; ) {
      const runs = await api(`/api/workflows/${workflowId}/runs`);
      const run = runs.find((r) => r.id === runId);
      activeRun = run || null;
      pipelineRunAbort.hidden = !run || run.status !== "running";
      if (run) await renderRunProgress(run);
      if (run && (run.status === "completed" || run.status === "failed" || run.status === "cancelled")) {
        pipelineRunAbort.hidden = true;
        await refreshAgents();
        await refreshUsage();
        return;
      }
      await new Promise((r) => setTimeout(r, 1e3));
    }
  }
  function initPipelines() {
    document.getElementById("new-pipeline-btn").addEventListener("click", () => {
      if (getAgents().length === 0) {
        alert("Recruit at least one agent before building a pipeline.");
        return;
      }
      pipelineStepsEl.innerHTML = "";
      addPipelineStepRow();
      pipelineDialog.showModal();
    });
    document.getElementById("pipeline-add-step").addEventListener("click", addPipelineStepRow);
    document.getElementById("pipeline-cancel").addEventListener("click", () => pipelineDialog.close());
    document.getElementById("pipeline-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = new FormData(e.target).get("name");
      const agent_ids = [...pipelineStepsEl.querySelectorAll("select")].map((s) => s.value);
      await api("/api/workflows", jsonBody({ name, agent_ids }));
      e.target.reset();
      pipelineDialog.close();
      await refreshPipelines();
    });
    document.getElementById("pipeline-run-cancel").addEventListener("click", () => pipelineRunDialog.close());
    pipelineRunAbort.addEventListener("click", async () => {
      const step = activeRun?.steps.find((s) => s.status === "running" || s.status === "pending");
      if (step) await api(`/api/jobs/${step.id}/cancel`, { method: "POST" });
    });
    document.getElementById("pipeline-run-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = new FormData(e.target).get("input");
      pipelineRunProgress.innerHTML = "";
      const { run_id } = await api(`/api/workflows/${selectedPipelineId}/run`, jsonBody({ input }));
      await pollPipelineRun(selectedPipelineId, run_id);
    });
  }

  // src/agent_workforce/static/ts/missions.ts
  var missionDialog = document.getElementById("mission-dialog");
  var missionForm = document.getElementById("mission-form");
  var missionPreview = document.getElementById("mission-preview");
  var missionsEl = document.getElementById("missions");
  var missions = [];
  var OBJECTIVE_TEMPLATES = [
    "Research the top 3 competitors for [product] and summarize their pricing.",
    "Summarize this week's news about [topic] into a short brief.",
    "Draft a week's worth of social media post ideas for [topic].",
    "Write a README draft for [project] and save it to disk."
  ];
  function renderPlanPreview(plan) {
    const steps = plan.steps.map(
      (s) => `<li><strong>${s.name || s.role}</strong> \u2014 ${s.provider}/${s.model}${s.capabilities.length ? ` (needs: ${s.capabilities.join(", ")})` : ""}<div class="plan-step-instructions">${s.instructions}</div></li>`
    ).join("");
    const warnings = plan.warnings.length ? `<ul class="plan-warnings">${plan.warnings.map((w) => `<li>${w}</li>`).join("")}</ul>` : "";
    const actions = plan.status === "proposed" ? `<div class="actions">
           <button type="button" id="mission-reject">Reject</button>
           <button type="button" id="mission-approve">Approve &amp; run</button>
         </div>` : "";
    missionPreview.innerHTML = `
    <p class="plan-summary">${plan.summary}</p>
    <ol class="plan-steps">${steps}</ol>
    ${warnings}
    ${actions}
  `;
    missionPreview.querySelector("#mission-reject")?.addEventListener("click", async () => {
      await api(`/api/plans/${plan.id}/reject`, { method: "POST" });
      missionDialog.close();
      await refreshMissions();
    });
    missionPreview.querySelector("#mission-approve")?.addEventListener("click", async () => {
      const { workflow_id, run_id } = await api(
        `/api/plans/${plan.id}/approve`,
        { method: "POST" }
      );
      await refreshPipelines();
      await refreshMissions();
      missionDialog.close();
      showRunProgress(plan.objective, workflow_id, run_id);
    });
  }
  function openPlanDialog(plan) {
    missionForm.hidden = true;
    renderPlanPreview(plan);
    missionDialog.showModal();
  }
  function renderMissions() {
    missionsEl.innerHTML = "";
    if (missions.length === 0) {
      missionsEl.innerHTML = '<p class="empty-missions">No missions yet. Give the workforce an objective with "+ New mission".</p>';
      return;
    }
    for (const plan of missions) {
      const card = document.createElement("div");
      card.className = "mission-card";
      card.dataset.status = plan.status;
      card.innerHTML = `
      <div class="mission-objective">${plan.objective}</div>
      <div class="mission-status">${plan.status}</div>
      <div class="mission-actions"></div>
    `;
      const actionsEl = card.querySelector(".mission-actions");
      const button = document.createElement("button");
      if (plan.status === "proposed") {
        button.textContent = "Review";
        button.addEventListener("click", () => openPlanDialog(plan));
        actionsEl.appendChild(button);
      } else if (plan.status === "approved" && plan.workflow_id) {
        button.textContent = "View run";
        button.addEventListener("click", async () => {
          const runs = await api(`/api/workflows/${plan.workflow_id}/runs`);
          if (runs[0]) showRunProgress(plan.objective, plan.workflow_id, runs[0].id);
        });
        actionsEl.appendChild(button);
        const rerun = document.createElement("button");
        rerun.textContent = "Run again";
        rerun.addEventListener("click", async () => {
          const { run_id } = await api(
            `/api/workflows/${plan.workflow_id}/run`,
            jsonBody({ input: plan.objective })
          );
          showRunProgress(plan.objective, plan.workflow_id, run_id);
        });
        actionsEl.appendChild(rerun);
      }
      missionsEl.appendChild(card);
    }
  }
  async function refreshMissions() {
    missions = await api("/api/plans");
    renderMissions();
  }
  function initMissions() {
    const templatesEl = document.getElementById("mission-templates");
    const objectiveInput = missionForm.querySelector("textarea[name=objective]");
    for (const template of OBJECTIVE_TEMPLATES) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = template;
      btn.addEventListener("click", () => {
        objectiveInput.value = template;
        objectiveInput.focus();
      });
      templatesEl.appendChild(btn);
    }
    document.getElementById("new-mission-btn").addEventListener("click", () => {
      missionForm.hidden = false;
      missionPreview.innerHTML = "";
      missionDialog.showModal();
    });
    document.getElementById("mission-cancel").addEventListener("click", () => missionDialog.close());
    missionForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const objective = new FormData(missionForm).get("objective");
      missionPreview.innerHTML = "Thinking...";
      try {
        const plan = await api("/api/plans", jsonBody({ objective }));
        missionForm.hidden = true;
        renderPlanPreview(plan);
        await refreshMissions();
      } catch (err) {
        missionPreview.textContent = err.message;
      }
    });
  }

  // src/agent_workforce/static/ts/opportunities.ts
  var opportunitiesEl = document.getElementById("opportunities");
  var ledgerBadge = document.getElementById("ledger-badge");
  var opportunityDialog = document.getElementById("opportunity-dialog");
  var opportunityForm = document.getElementById("opportunity-form");
  var discoverDialog = document.getElementById("discover-dialog");
  var discoverForm = document.getElementById("discover-form");
  var orchestratorDialog = document.getElementById("orchestrator-dialog");
  var orchestratorForm = document.getElementById("orchestrator-form");
  var orchestratorMessagesEl = document.getElementById("orchestrator-messages");
  var opportunities = [];
  var MODE_LABEL = {
    emergency_stop: "\u26A0 EMERGENCY STOP \u2014 ",
    recovery: "\u26A0 RECOVERY MODE \u2014 ",
    running: ""
  };
  async function refreshLedger() {
    const ledger = await api("/api/ledger");
    ledgerBadge.textContent = `${MODE_LABEL[ledger.mode]}$${ledger.balance.toFixed(2)} balance`;
    ledgerBadge.className = ledger.mode === "running" ? "" : "error";
  }
  function buildOpportunityCard(opp) {
    const card = document.createElement("div");
    card.className = "opportunity-card";
    card.dataset.status = opp.status;
    card.innerHTML = `
      <div class="opportunity-title">${opp.title}</div>
      <div class="opportunity-status">${opp.status}${opp.forecast_value ? ` \xB7 est. $${opp.forecast_value}` : ""}</div>
      <div class="opportunity-description">${opp.description}</div>
      ${opp.notes ? `<div class="opportunity-notes">Learned: ${opp.notes}</div>` : ""}
      <div class="opportunity-actions"></div>
    `;
    const actions = card.querySelector(".opportunity-actions");
    if (!opp.workflow_id) {
      const planBtn = document.createElement("button");
      planBtn.textContent = "Plan";
      planBtn.addEventListener("click", async () => {
        planBtn.textContent = "Thinking...";
        try {
          const plan = await api(
            "/api/plans",
            jsonBody({ objective: opp.description || opp.title, opportunity_id: opp.id })
          );
          openPlanDialog(plan);
          await refreshOpportunities();
        } catch (err) {
          alert(err.message);
          planBtn.textContent = "Plan";
        }
      });
      actions.appendChild(planBtn);
    } else {
      const viewBtn = document.createElement("button");
      viewBtn.textContent = "View run";
      viewBtn.addEventListener("click", async () => {
        const runs = await api(`/api/workflows/${opp.workflow_id}/runs`);
        if (runs[0]) showRunProgress(opp.title, opp.workflow_id, runs[0].id);
      });
      actions.appendChild(viewBtn);
    }
    const revenueBtn = document.createElement("button");
    revenueBtn.textContent = "Record revenue";
    revenueBtn.addEventListener("click", async () => {
      const amountStr = prompt(`Revenue earned from "${opp.title}" so far (USD)?`);
      if (!amountStr) return;
      const amount = Number(amountStr);
      if (!Number.isFinite(amount)) return;
      await api(`/api/opportunities/${opp.id}/revenue`, jsonBody({ amount, note: "" }));
      await refreshLedger();
    });
    actions.appendChild(revenueBtn);
    if (["success", "failure", "learned"].includes(opp.status)) {
      const learnBtn = document.createElement("button");
      learnBtn.textContent = opp.notes ? "Edit learning" : "Record learning";
      learnBtn.addEventListener("click", async () => {
        const note = prompt(`What did we learn from "${opp.title}"?`, opp.notes || "");
        if (note === null) return;
        await api(`/api/opportunities/${opp.id}/notes`, jsonBody({ note }));
        await refreshOpportunities();
      });
      actions.appendChild(learnBtn);
    }
    return card;
  }
  var STATUS_ORDER = [
    "discovered",
    "researching",
    "validating",
    "refined",
    "awaiting_approval",
    "approved",
    "queued",
    "assigned",
    "executing",
    "paused",
    "success",
    "failure",
    "measuring_outcome",
    "learned"
  ];
  function renderOpportunities() {
    opportunitiesEl.innerHTML = "";
    if (opportunities.length === 0) {
      opportunitiesEl.innerHTML = '<p class="empty-opportunities">No opportunities yet. Let the Orchestrator find some, or add one yourself.</p>';
      return;
    }
    const statuses = STATUS_ORDER.filter((s) => opportunities.some((o) => o.status === s));
    for (const status of statuses) {
      const inStatus = opportunities.filter((o) => o.status === status);
      const forecastTotal = inStatus.reduce((sum, o) => sum + (o.forecast_value || 0), 0);
      const column = document.createElement("div");
      column.className = "opportunity-column";
      column.innerHTML = `
      <div class="opportunity-column-header">
        ${status} <span class="opportunity-column-count">${inStatus.length}</span>
        ${forecastTotal ? `<span class="opportunity-column-forecast">est. $${forecastTotal.toFixed(0)}</span>` : ""}
      </div>
    `;
      for (const opp of inStatus) column.appendChild(buildOpportunityCard(opp));
      opportunitiesEl.appendChild(column);
    }
  }
  async function refreshOpportunities() {
    opportunities = await api("/api/opportunities");
    renderOpportunities();
  }
  async function refreshOrchestratorMessages() {
    const messages = await api("/api/orchestrator/messages");
    orchestratorMessagesEl.innerHTML = messages.map((m) => `<div class="orchestrator-message" data-role="${m.role}">${m.content}</div>`).join("");
    orchestratorMessagesEl.scrollTop = orchestratorMessagesEl.scrollHeight;
  }
  function initOpportunities() {
    document.getElementById("new-opportunity-btn").addEventListener("click", () => opportunityDialog.showModal());
    document.getElementById("opportunity-cancel").addEventListener("click", () => opportunityDialog.close());
    opportunityForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = new FormData(opportunityForm);
      const forecast = form.get("forecast_value");
      await api(
        "/api/opportunities",
        jsonBody({
          title: form.get("title"),
          description: form.get("description") || "",
          forecast_value: forecast ? Number(forecast) : null
        })
      );
      opportunityForm.reset();
      opportunityDialog.close();
      await refreshOpportunities();
    });
    document.getElementById("discover-opportunities-btn").addEventListener("click", () => discoverDialog.showModal());
    document.getElementById("discover-cancel").addEventListener("click", () => discoverDialog.close());
    discoverForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const hint = new FormData(discoverForm).get("hint") || "";
      const submitBtn = discoverForm.querySelector("button[type=submit]");
      submitBtn.textContent = "Thinking...";
      try {
        await api("/api/opportunities/discover", jsonBody({ hint }));
        discoverForm.reset();
        discoverDialog.close();
        await refreshOpportunities();
      } catch (err) {
        alert(err.message);
      } finally {
        submitBtn.textContent = "Discover";
      }
    });
    document.getElementById("orchestrator-chat-btn").addEventListener("click", () => {
      orchestratorDialog.showModal();
      refreshOrchestratorMessages();
    });
    document.getElementById("orchestrator-close").addEventListener("click", () => orchestratorDialog.close());
    orchestratorForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const question = String(new FormData(orchestratorForm).get("question") || "");
      const submitBtn = orchestratorForm.querySelector("button[type=submit]");
      submitBtn.disabled = true;
      try {
        await api("/api/orchestrator/ask", jsonBody({ question }));
        orchestratorForm.reset();
        await refreshOrchestratorMessages();
      } catch (err) {
        alert(err.message);
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  // src/agent_workforce/static/ts/main.ts
  initAgents();
  initPipelines();
  initMissions();
  initOpportunities();
  initAutomationsPanel();
  initWorkspace();
  refreshAgents();
  refreshInfrastructure();
  refreshPipelines();
  refreshMissions();
  refreshOpportunities();
  refreshLedger();
  refreshUsage();
  refreshActivity();
  setInterval(refreshAgents, 4e3);
  setInterval(refreshUsage, 1e4);
  setInterval(refreshActivity, 5e3);
  setInterval(refreshMissions, 5e3);
  setInterval(refreshOpportunities, 5e3);
  setInterval(refreshLedger, 1e4);
})();
//# sourceMappingURL=bundle.js.map
