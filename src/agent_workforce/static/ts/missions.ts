import { api, jsonBody } from "./api.js";
import { refreshPipelines, showRunProgress } from "./pipelines.js";
import type { Plan, WorkflowRun } from "./types.js";

const missionDialog = document.getElementById("mission-dialog") as HTMLDialogElement;
const missionForm = document.getElementById("mission-form") as HTMLFormElement;
const missionPreview = document.getElementById("mission-preview") as HTMLElement;
const missionsEl = document.getElementById("missions") as HTMLElement;

let missions: Plan[] = [];

// Starter recipes: a few ready-made objectives so a new user has something to
// click instead of staring at a blank textarea. Pure content, no backend.
const OBJECTIVE_TEMPLATES = [
  "Research the top 3 competitors for [product] and summarize their pricing.",
  "Summarize this week's news about [topic] into a short brief.",
  "Draft a week's worth of social media post ideas for [topic].",
  "Write a README draft for [project] and save it to disk.",
];

function renderPlanPreview(plan: Plan): void {
  const steps = plan.steps
    .map(
      (s) => `<li><strong>${s.name || s.role}</strong> — ${s.provider}/${s.model}${
        s.capabilities.length ? ` (needs: ${s.capabilities.join(", ")})` : ""
      }<div class="plan-step-instructions">${s.instructions}</div></li>`
    )
    .join("");
  const warnings = plan.warnings.length
    ? `<ul class="plan-warnings">${plan.warnings.map((w) => `<li>${w}</li>`).join("")}</ul>`
    : "";
  const actions =
    plan.status === "proposed"
      ? `<div class="actions">
           <button type="button" id="mission-reject">Reject</button>
           <button type="button" id="mission-approve">Approve &amp; run</button>
         </div>`
      : "";

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
    const { workflow_id, run_id } = await api<{ workflow_id: string; run_id: string }>(
      `/api/plans/${plan.id}/approve`,
      { method: "POST" }
    );
    await refreshPipelines();
    await refreshMissions();
    missionDialog.close();
    showRunProgress(plan.objective, workflow_id, run_id);
  });
}

export function openPlanDialog(plan: Plan): void {
  missionForm.hidden = true;
  renderPlanPreview(plan);
  missionDialog.showModal();
}

function renderMissions(): void {
  missionsEl.innerHTML = "";
  if (missions.length === 0) {
    missionsEl.innerHTML =
      '<p class="empty-missions">No missions yet. Give the workforce an objective with "+ New mission".</p>';
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
    const actionsEl = card.querySelector(".mission-actions")!;
    const button = document.createElement("button");
    if (plan.status === "proposed") {
      button.textContent = "Review";
      button.addEventListener("click", () => openPlanDialog(plan));
      actionsEl.appendChild(button);
    } else if (plan.status === "approved" && plan.workflow_id) {
      button.textContent = "View run";
      button.addEventListener("click", async () => {
        const runs = await api<WorkflowRun[]>(`/api/workflows/${plan.workflow_id}/runs`);
        if (runs[0]) showRunProgress(plan.objective, plan.workflow_id!, runs[0].id);
      });
      actionsEl.appendChild(button);

      // Recipe: an approved mission's workflow already exists, so re-running
      // it needs no re-planning and no re-approval - a trusted routine.
      const rerun = document.createElement("button");
      rerun.textContent = "Run again";
      rerun.addEventListener("click", async () => {
        const { run_id } = await api<{ run_id: string }>(
          `/api/workflows/${plan.workflow_id}/run`,
          jsonBody({ input: plan.objective })
        );
        showRunProgress(plan.objective, plan.workflow_id!, run_id);
      });
      actionsEl.appendChild(rerun);
    }
    missionsEl.appendChild(card);
  }
}

export async function refreshMissions(): Promise<void> {
  missions = await api<Plan[]>("/api/plans");
  renderMissions();
}

export function initMissions(): void {
  const templatesEl = document.getElementById("mission-templates") as HTMLElement;
  const objectiveInput = missionForm.querySelector("textarea[name=objective]") as HTMLTextAreaElement;
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

  document.getElementById("new-mission-btn")!.addEventListener("click", () => {
    missionForm.hidden = false;
    missionPreview.innerHTML = "";
    missionDialog.showModal();
  });
  document.getElementById("mission-cancel")!.addEventListener("click", () => missionDialog.close());

  missionForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const objective = new FormData(missionForm).get("objective");
    missionPreview.innerHTML = "Thinking...";
    try {
      const plan = await api<Plan>("/api/plans", jsonBody({ objective }));
      missionForm.hidden = true;
      renderPlanPreview(plan);
      await refreshMissions();
    } catch (err) {
      missionPreview.textContent = (err as Error).message;
    }
  });
}
