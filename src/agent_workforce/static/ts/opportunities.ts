import { api, jsonBody } from "./api.js";
import { openPlanDialog } from "./missions.js";
import { showRunProgress } from "./pipelines.js";
import type { Ledger, Opportunity, OrchestratorMessage, Plan, WorkflowRun } from "./types.js";

const opportunitiesEl = document.getElementById("opportunities") as HTMLElement;
const ledgerBadge = document.getElementById("ledger-badge") as HTMLElement;
const opportunityDialog = document.getElementById("opportunity-dialog") as HTMLDialogElement;
const opportunityForm = document.getElementById("opportunity-form") as HTMLFormElement;
const discoverDialog = document.getElementById("discover-dialog") as HTMLDialogElement;
const discoverForm = document.getElementById("discover-form") as HTMLFormElement;
const orchestratorDialog = document.getElementById("orchestrator-dialog") as HTMLDialogElement;
const orchestratorForm = document.getElementById("orchestrator-form") as HTMLFormElement;
const orchestratorMessagesEl = document.getElementById("orchestrator-messages") as HTMLElement;

let opportunities: Opportunity[] = [];

const MODE_LABEL: Record<string, string> = {
  emergency_stop: "⚠ EMERGENCY STOP — ",
  recovery: "⚠ RECOVERY MODE — ",
  running: "",
};

export async function refreshLedger(): Promise<void> {
  const ledger = await api<Ledger>("/api/ledger");
  ledgerBadge.textContent = `${MODE_LABEL[ledger.mode]}$${ledger.balance.toFixed(2)} balance`;
  ledgerBadge.className = ledger.mode === "running" ? "" : "error";
}

function buildOpportunityCard(opp: Opportunity): HTMLElement {
    const card = document.createElement("div");
    card.className = "opportunity-card";
    card.dataset.status = opp.status;
    card.innerHTML = `
      <div class="opportunity-title">${opp.title}</div>
      <div class="opportunity-status">${opp.status}${opp.forecast_value ? ` · est. $${opp.forecast_value}` : ""}</div>
      <div class="opportunity-description">${opp.description}</div>
      ${opp.notes ? `<div class="opportunity-notes">Learned: ${opp.notes}</div>` : ""}
      <div class="opportunity-actions"></div>
    `;
    const actions = card.querySelector(".opportunity-actions")!;

    if (!opp.workflow_id) {
      const planBtn = document.createElement("button");
      planBtn.textContent = "Plan";
      planBtn.addEventListener("click", async () => {
        planBtn.textContent = "Thinking...";
        try {
          const plan = await api<Plan>(
            "/api/plans",
            jsonBody({ objective: opp.description || opp.title, opportunity_id: opp.id })
          );
          openPlanDialog(plan);
          await refreshOpportunities();
        } catch (err) {
          alert((err as Error).message);
          planBtn.textContent = "Plan";
        }
      });
      actions.appendChild(planBtn);
    } else {
      const viewBtn = document.createElement("button");
      viewBtn.textContent = "View run";
      viewBtn.addEventListener("click", async () => {
        const runs = await api<WorkflowRun[]>(`/api/workflows/${opp.workflow_id}/runs`);
        if (runs[0]) showRunProgress(opp.title, opp.workflow_id!, runs[0].id);
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

// Board columns: one per status actually in use, in lifecycle order, rather
// than a fixed list of 14 - keeps the board from being mostly empty columns
// in a small workspace.
const STATUS_ORDER = [
  "discovered", "researching", "validating", "refined", "awaiting_approval",
  "approved", "queued", "assigned", "executing", "paused",
  "success", "failure", "measuring_outcome", "learned",
];

function renderOpportunities(): void {
  opportunitiesEl.innerHTML = "";
  if (opportunities.length === 0) {
    opportunitiesEl.innerHTML =
      '<p class="empty-opportunities">No opportunities yet. Let the Orchestrator find some, or add one yourself.</p>';
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

export async function refreshOpportunities(): Promise<void> {
  opportunities = await api<Opportunity[]>("/api/opportunities");
  renderOpportunities();
}

async function refreshOrchestratorMessages(): Promise<void> {
  const messages = await api<OrchestratorMessage[]>("/api/orchestrator/messages");
  orchestratorMessagesEl.innerHTML = messages
    .map((m) => `<div class="orchestrator-message" data-role="${m.role}">${m.content}</div>`)
    .join("");
  orchestratorMessagesEl.scrollTop = orchestratorMessagesEl.scrollHeight;
}

export function initOpportunities(): void {
  document.getElementById("new-opportunity-btn")!.addEventListener("click", () => opportunityDialog.showModal());
  document.getElementById("opportunity-cancel")!.addEventListener("click", () => opportunityDialog.close());
  opportunityForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(opportunityForm);
    const forecast = form.get("forecast_value");
    await api(
      "/api/opportunities",
      jsonBody({
        title: form.get("title"),
        description: form.get("description") || "",
        forecast_value: forecast ? Number(forecast) : null,
      })
    );
    opportunityForm.reset();
    opportunityDialog.close();
    await refreshOpportunities();
  });

  document.getElementById("discover-opportunities-btn")!.addEventListener("click", () => discoverDialog.showModal());
  document.getElementById("discover-cancel")!.addEventListener("click", () => discoverDialog.close());
  discoverForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const hint = new FormData(discoverForm).get("hint") || "";
    const submitBtn = discoverForm.querySelector("button[type=submit]") as HTMLButtonElement;
    submitBtn.textContent = "Thinking...";
    try {
      await api("/api/opportunities/discover", jsonBody({ hint }));
      discoverForm.reset();
      discoverDialog.close();
      await refreshOpportunities();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      submitBtn.textContent = "Discover";
    }
  });

  document.getElementById("orchestrator-chat-btn")!.addEventListener("click", () => {
    orchestratorDialog.showModal();
    refreshOrchestratorMessages();
  });
  document.getElementById("orchestrator-close")!.addEventListener("click", () => orchestratorDialog.close());
  orchestratorForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const question = String(new FormData(orchestratorForm).get("question") || "");
    const submitBtn = orchestratorForm.querySelector("button[type=submit]") as HTMLButtonElement;
    submitBtn.disabled = true;
    try {
      await api("/api/orchestrator/ask", jsonBody({ question }));
      orchestratorForm.reset();
      await refreshOrchestratorMessages();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      submitBtn.disabled = false;
    }
  });
}
