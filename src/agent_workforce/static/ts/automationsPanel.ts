import { api, jsonBody } from "./api.js";
import type { Automation, Workflow } from "./types.js";

const automationDialog = document.getElementById("automation-dialog") as HTMLDialogElement;
const automationList = document.getElementById("automation-list") as HTMLElement;
const scheduleTypeSelect = document.getElementById("automation-schedule-type") as HTMLSelectElement;
const intervalField = document.getElementById("automation-interval-field") as HTMLElement;
const dailyField = document.getElementById("automation-daily-field") as HTMLElement;

let selectedWorkflowId: string | null = null;

function describeAutomation(a: Automation): { when: string; next: string; last: string } {
  const when = a.schedule_type === "interval" ? `every ${a.interval_minutes}m` : `daily at ${a.daily_at}`;
  const next = a.next_run_at ? new Date(a.next_run_at * 1000).toLocaleString() : "-";
  const last = a.last_run_at ? `${a.last_run_status} @ ${new Date(a.last_run_at * 1000).toLocaleString()}` : "never run";
  return { when, next, last };
}

async function refreshAutomationList(workflowId: string): Promise<void> {
  const items = await api<Automation[]>(`/api/workflows/${workflowId}/automations`);
  automationList.innerHTML = "";
  for (const a of items) {
    const { when, next, last } = describeAutomation(a);
    const row = document.createElement("div");
    row.className = "automation-row";
    row.innerHTML = `
      <div>${when} · next ${next} · last: ${last}</div>
      <button class="automation-toggle">${a.enabled ? "Pause" : "Resume"}</button>
      <button class="automation-delete">Delete</button>
    `;
    row.querySelector(".automation-toggle")!.addEventListener("click", async () => {
      await api(`/api/automations/${a.id}/toggle`, { method: "POST" });
      refreshAutomationList(workflowId);
    });
    row.querySelector(".automation-delete")!.addEventListener("click", async () => {
      await api(`/api/automations/${a.id}`, { method: "DELETE" });
      refreshAutomationList(workflowId);
    });
    automationList.appendChild(row);
  }
}

export function openAutomationDialog(pipeline: Workflow): void {
  selectedWorkflowId = pipeline.id;
  document.getElementById("automation-dialog-title")!.textContent = `Schedule "${pipeline.name}"`;
  refreshAutomationList(pipeline.id);
  automationDialog.showModal();
}

export function initAutomationsPanel(): void {
  scheduleTypeSelect.addEventListener("change", () => {
    const daily = scheduleTypeSelect.value === "daily";
    intervalField.style.display = daily ? "none" : "";
    dailyField.style.display = daily ? "" : "none";
  });

  document.getElementById("automation-cancel")!.addEventListener("click", () => automationDialog.close());

  document.getElementById("automation-form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(e.target as HTMLFormElement);
    const schedule_type = form.get("schedule_type");
    await api(`/api/workflows/${selectedWorkflowId}/automations`, jsonBody({
      schedule_type,
      interval_minutes: schedule_type === "interval" ? Number(form.get("interval_minutes")) : null,
      daily_at: schedule_type === "daily" ? form.get("daily_at") : null,
      input: form.get("input"),
    }));
    (e.target as HTMLFormElement).reset();
    await refreshAutomationList(selectedWorkflowId!);
  });
}
