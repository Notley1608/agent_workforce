import { api } from "./api.js";
import type { ActivityEvent } from "./types.js";

const feedEl = document.getElementById("activity-feed") as HTMLElement;

export async function refreshActivity(): Promise<void> {
  const events = await api<ActivityEvent[]>("/api/activity");
  if (events.length === 0) {
    feedEl.innerHTML = '<li class="empty-activity">Nothing yet. Activity shows up here as agents work.</li>';
    return;
  }
  feedEl.innerHTML = events
    .map(
      (e) =>
        `<li><span class="activity-time">${new Date(e.ts * 1000).toLocaleTimeString()}</span>${e.label}</li>`
    )
    .join("");
}
