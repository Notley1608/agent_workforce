import { api, jsonBody } from "./api.js";
import { fetchTimelineHtml } from "./timeline.js";
import type { Agent, AgentDraft, Job } from "./types.js";
import { refreshUsage } from "./workspace.js";

const floor = document.getElementById("floor") as HTMLElement;
const recruitDialog = document.getElementById("recruit-dialog") as HTMLDialogElement;
const recruitForm = document.getElementById("recruit-form") as HTMLFormElement;
const taskDialog = document.getElementById("task-dialog") as HTMLDialogElement;
const taskOutput = document.getElementById("task-output") as HTMLElement;
const taskHistory = document.getElementById("task-history") as HTMLElement;
const taskAbort = document.getElementById("task-abort") as HTMLButtonElement;

let agents: Agent[] = [];
let selectedAgentId: string | null = null;
let activeJobId: string | null = null;
// Agent Builder: a proposed draft's role_type/capabilities aren't editable
// fields in the recruit form, so they ride along here until the form submits.
let pendingDraft: AgentDraft | null = null;

export function getAgents(): Agent[] {
  return agents;
}

export function agentName(id: string): string {
  return agents.find((a) => a.id === id)?.name || "?";
}

function renderFloor(): void {
  floor.innerHTML = "";
  if (agents.length === 0) {
    floor.innerHTML = '<p class="empty-floor">No one on the floor yet. Recruit your first agent.</p>';
    return;
  }
  for (const agent of agents) {
    const desk = document.createElement("div");
    desk.className = "desk";
    desk.dataset.status = agent.status;
    const successRate = agent.jobs_done > 0 ? Math.round((agent.jobs_completed / agent.jobs_done) * 100) : null;
    desk.innerHTML = `
      <div class="avatar">${agent.avatar}</div>
      <div class="name">${agent.name}</div>
      <div class="role">${agent.role}</div>
      <div class="status"><span class="dot"></span>${agent.status}</div>
      <div class="profile">${successRate === null ? "no jobs yet" : `${successRate}% success · ${agent.jobs_done} jobs`}</div>
    `;
    desk.addEventListener("click", () => openTaskDialog(agent));
    floor.appendChild(desk);
  }
}

export async function refreshAgents(): Promise<void> {
  agents = await api<Agent[]>("/api/agents");
  renderFloor();
}

async function renderHistory(agentId: string): Promise<void> {
  const jobs = await api<Job[]>(`/api/agents/${agentId}/jobs`);
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

function openTaskDialog(agent: Agent): void {
  selectedAgentId = agent.id;
  document.getElementById("task-dialog-title")!.textContent = `Assign a task to ${agent.name}`;
  taskOutput.textContent = "";
  taskOutput.className = "";
  taskAbort.hidden = true;
  renderHistory(agent.id);
  taskDialog.showModal();
}

async function pollJob(agentId: string, jobId: string): Promise<void> {
  activeJobId = jobId;
  taskAbort.hidden = false;
  for (;;) {
    const jobs = await api<Job[]>(`/api/agents/${agentId}/jobs`);
    const job = jobs.find((j) => j.id === jobId);
    if (job && job.status === "completed") {
      taskOutput.textContent = job.output;
      if (job.tools_used && job.tools_used.length) {
        const tools = document.createElement("div");
        tools.className = "tools-used";
        tools.textContent = job.tools_used.join(" · ");
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
      actions.querySelector(".approve-risky")!.addEventListener("click", () => {
        api(`/api/jobs/${job.id}/approve`, { method: "POST" });
      });
      actions.querySelector(".reject-risky")!.addEventListener("click", () => {
        api(`/api/jobs/${job.id}/reject`, { method: "POST" });
      });
      taskOutput.appendChild(actions);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

export function initAgents(): void {
  const DEFAULT_MODELS: Record<string, string> = {
    groq: "openai/gpt-oss-120b",
  };
  const providerSelect = document.getElementById("recruit-provider") as HTMLSelectElement;
  const modelInput = document.getElementById("recruit-model") as HTMLInputElement;
  providerSelect.addEventListener("change", () => {
    modelInput.value = DEFAULT_MODELS[providerSelect.value] || "";
  });

  document.getElementById("recruit-btn")!.addEventListener("click", () => {
    pendingDraft = null;
    recruitDialog.showModal();
  });
  document.getElementById("recruit-cancel")!.addEventListener("click", () => recruitDialog.close());

  recruitForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(e.target as HTMLFormElement);
    await api("/api/agents", jsonBody({
      name: form.get("name"),
      role: form.get("role"),
      role_type: pendingDraft?.role_type,
      capabilities_override: pendingDraft?.capabilities_override,
      avatar: form.get("avatar") || "🤖",
      provider: form.get("provider") || "groq",
      model: form.get("model") || "openai/gpt-oss-120b",
      instructions: form.get("instructions") || "",
    }));
    pendingDraft = null;
    (e.target as HTMLFormElement).reset();
    recruitDialog.close();
    await refreshAgents();
  });

  document.getElementById("build-agent-btn")!.addEventListener("click", async () => {
    const brief = prompt("What should this agent do?");
    if (!brief) return;
    const btn = document.getElementById("build-agent-btn") as HTMLButtonElement;
    btn.textContent = "Thinking...";
    try {
      pendingDraft = await api<AgentDraft>("/api/agents/propose", jsonBody({ brief }));
      const form = recruitForm;
      (form.elements.namedItem("name") as HTMLInputElement).value = pendingDraft.name;
      (form.elements.namedItem("instructions") as HTMLTextAreaElement).value = pendingDraft.instructions;
      const roleSelect = form.elements.namedItem("role") as HTMLSelectElement;
      const match = [...roleSelect.options].find((o) => o.value.toLowerCase() === pendingDraft!.role.toLowerCase());
      if (match) roleSelect.value = match.value;
      recruitDialog.showModal();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      btn.textContent = "🧭 Orchestrator: build agent";
    }
  });

  document.getElementById("task-cancel")!.addEventListener("click", () => taskDialog.close());
  taskAbort.addEventListener("click", async () => {
    if (activeJobId) await api(`/api/jobs/${activeJobId}/cancel`, { method: "POST" });
  });

  document.getElementById("task-form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = new FormData(e.target as HTMLFormElement).get("input");
    taskOutput.textContent = "Working...";
    taskOutput.className = "";
    try {
      const { job_id } = await api<{ job_id: string }>(`/api/agents/${selectedAgentId}/tasks`, jsonBody({ input }));
      await refreshAgents();
      await pollJob(selectedAgentId!, job_id);
    } catch (err) {
      taskOutput.textContent = (err as Error).message;
      taskOutput.className = "error";
    }
  });
}
