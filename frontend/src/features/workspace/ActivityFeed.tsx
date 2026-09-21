import { useActivity } from "../../lib/api/workspace";

export function ActivityFeed() {
  const { data: events } = useActivity();

  if (!events || events.length === 0) {
    return <p className="text-text-dim">Nothing yet. Activity shows up here as agents work.</p>;
  }

  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {events.map((e, i) => (
        <li key={`${e.ts}-${i}`} className="flex gap-3 border-b border-border/60 pb-1.5 last:border-0">
          <span className="shrink-0 text-text-dim">{new Date(e.ts * 1000).toLocaleTimeString()}</span>
          <span className="text-text">{e.label}</span>
        </li>
      ))}
    </ul>
  );
}
