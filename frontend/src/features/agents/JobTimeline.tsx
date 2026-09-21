import { useJobTimeline } from "../../lib/api/agents";

export function JobTimeline({ jobId }: { jobId: string }) {
  const { data: events } = useJobTimeline(jobId);
  if (!events || events.length === 0) return null;

  return (
    <div className="mt-2 space-y-1 border-t border-dashed border-border pt-1.5 text-xs text-text-dim">
      {events.map((event) => (
        <div key={event.id}>
          {new Date(event.created_at * 1000).toLocaleTimeString()} · {event.label}
        </div>
      ))}
    </div>
  );
}
