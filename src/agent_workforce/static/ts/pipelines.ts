import { agentName, getAgents, refreshAgents } from "./agents.js";
import { api, jsonBody } from "./api.js";
import { openAutomationDialog } from "./automationsPanel.js";
import { fetchTimelineHtml } from "./timeline.js";
import type { Workflow, WorkflowRun, WorkflowStep } from "./types.js";
import { refreshUsage } from "./workspace.js";

const pipelinesEl = document.getElementById("pipelines") as HTMLElement;
const pipelineDialog = document.getElementById("pipeline-dialog") as HTMLDialogElement;
const pipelineStepsEl = document.getElementById("pipeline-steps") as HTMLElement;
const pipelineRunDialog = document.getElementById("pipeline-run-dialog") as HTMLDialogElement;
const pipelineRunForm = document.getElementById("pipeline-run-form") as HTMLElement;
const pipelineRunProgress = document.getElementById("pipeline-run-progress") as HTMLElement;
const pipelineRunAbort = document.getElementById("pipeline-run-abort") as HTMLButtonElement;

let pipelines: Workflow[] = [];
let selectedPipelineId: string | null = null;
let activeRun: WorkflowRun | null = null;

function addPipelineStepRow(): void {
  const row = document.createElement("div");
  row.className = "pipeline-step-row";
  const options = getAgents().map((a) => `<option value="${a.id}">${a.name} (${a.role})</option>`).join("");
  row.innerHTML = `<select required>${options}</select><button type="button">remove</button>`;
  row.querySelector("button")!.addEventListener("click", () => row.remove());
  pipelineStepsEl.appendChild(row);
}

function renderPipelines(): void {
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
    card.querySelector(".run-pipeline")!.addEventListener("click", () => openPipelineRunDialog(p));
    card.querySelector(".schedule-pipeline")!.addEventListener("click", () => openAutomationDialog(p));
    pipelinesEl.appendChild(card);
  }
}

export async function refreshPipelines(): Promise<void> {
  pipelines = await api<Workflow[]>("/api/workflows");
  renderPipelines();
}

function openPipelineRunDialog(pipeline: Workflow): void {
  selectedPipelineId = pipeline.id;
  document.getElementById("pipeline-run-title")!.textContent = `Run "${pipeline.name}"`;
  pipelineRunForm.hidden = false;
  pipelineRunProgress.innerHTML = "";
  pipelineRunAbort.hidden = true;
  activeRun = null;
  pipelineRunDialog.showModal();
}

// Shared with missions.ts: a run already started elsewhere (e.g. an approved
// plan) just needs the same progress view, without the "enter input" form.
export function showRunProgress(title: string, workflowId: string, runId: string): void {
  document.getElementById("pipeline-run-title")!.textContent = title;
  pipelineRunForm.hidden = true;
  pipelineRunProgress.innerHTML = "";
  pipelineRunAbort.hidden = true;
  activeRun = null;
  pipelineRunDialog.showModal();
  pollPipelineRun(workflowId, runId);
}

const timelineCache = new Map<string, string>();

async function timelineHtmlFor(step: WorkflowStep): Promise<string> {
  if (step.status !== "completed" && step.status !== "failed" && step.status !== "cancelled") return "";
  let html = timelineCache.get(step.id);
  if (html === undefined) {
    html = await fetchTimelineHtml(step.id);
    timelineCache.set(step.id, html);
  }
  return html;
}

async function renderRunProgress(run: WorkflowRun): Promise<void> {
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
      // The 1s poll loop below picks up the resulting status change - no
      // need to re-fetch here.
      actions.querySelector(".approve-risky")!.addEventListener("click", () => {
        api(`/api/jobs/${step.id}/approve`, { method: "POST" });
      });
      actions.querySelector(".reject-risky")!.addEventListener("click", () => {
        api(`/api/jobs/${step.id}/reject`, { method: "POST" });
      });
      el.appendChild(actions);
    }
    el.insertAdjacentHTML("beforeend", await timelineHtmlFor(step));
    pipelineRunProgress.appendChild(el);
  }
}

async function pollPipelineRun(workflowId: string, runId: string): Promise<void> {
  for (;;) {
    const runs = await api<WorkflowRun[]>(`/api/workflows/${workflowId}/runs`);
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
    await new Promise((r) => setTimeout(r, 1000));
  }
}

export function initPipelines(): void {
  document.getElementById("new-pipeline-btn")!.addEventListener("click", () => {
    if (getAgents().length === 0) {
      alert("Recruit at least one agent before building a pipeline.");
      return;
    }
    pipelineStepsEl.innerHTML = "";
    addPipelineStepRow();
    pipelineDialog.showModal();
  });
  document.getElementById("pipeline-add-step")!.addEventListener("click", addPipelineStepRow);
  document.getElementById("pipeline-cancel")!.addEventListener("click", () => pipelineDialog.close());

  document.getElementById("pipeline-form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = new FormData(e.target as HTMLFormElement).get("name");
    const agent_ids = [...pipelineStepsEl.querySelectorAll("select")].map((s) => s.value);
    await api("/api/workflows", jsonBody({ name, agent_ids }));
    (e.target as HTMLFormElement).reset();
    pipelineDialog.close();
    await refreshPipelines();
  });

  document.getElementById("pipeline-run-cancel")!.addEventListener("click", () => pipelineRunDialog.close());
  pipelineRunAbort.addEventListener("click", async () => {
    const step = activeRun?.steps.find((s) => s.status === "running" || s.status === "pending");
    if (step) await api(`/api/jobs/${step.id}/cancel`, { method: "POST" });
  });

  document.getElementById("pipeline-run-form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = new FormData(e.target as HTMLFormElement).get("input");
    pipelineRunProgress.innerHTML = "";
    const { run_id } = await api<{ run_id: string }>(`/api/workflows/${selectedPipelineId}/run`, jsonBody({ input }));
    await pollPipelineRun(selectedPipelineId!, run_id);
  });
}
