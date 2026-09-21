import { api } from "./api.js";
import type { JobEvent } from "./types.js";

export async function fetchTimelineHtml(jobId: string): Promise<string> {
  const events = await api<JobEvent[]>(`/api/jobs/${jobId}/timeline`);
  if (events.length === 0) return "";
  const items = events
    .map((e) => `<div>${new Date(e.created_at * 1000).toLocaleTimeString()} · ${e.label}</div>`)
    .join("");
  return `<div class="job-timeline">${items}</div>`;
}
