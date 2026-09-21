import { api, jsonBody } from "./api.js";
import type { InfrastructureItem, Settings, Usage } from "./types.js";

const infraEl = document.getElementById("infrastructure") as HTMLElement;
const usageBadge = document.getElementById("usage-badge") as HTMLElement;
const budgetInput = document.getElementById("budget-input") as HTMLInputElement;
const recoveryInput = document.getElementById("recovery-input") as HTMLInputElement;
const emergencyStopBtn = document.getElementById("emergency-stop-btn") as HTMLButtonElement;

export async function refreshInfrastructure(): Promise<void> {
  const items = await api<InfrastructureItem[]>("/api/infrastructure");
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

export async function refreshUsage(): Promise<void> {
  const usage = await api<Usage>("/api/usage");
  usageBadge.textContent = `$${usage.today_cost.toFixed(4)} today`;
}

async function refreshSettings(): Promise<void> {
  const settings = await api<Settings>("/api/settings");
  budgetInput.value = settings.daily_spend_limit === null ? "" : String(settings.daily_spend_limit);
  recoveryInput.value = settings.recovery_threshold === null ? "" : String(settings.recovery_threshold);
  emergencyStopBtn.dataset.active = String(settings.emergency_stop);
  emergencyStopBtn.textContent = settings.emergency_stop ? "Resume work" : "Emergency stop";
}

export function initWorkspace(): void {
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
