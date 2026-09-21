import { useInfrastructure, useToggleInfrastructure } from "../../lib/api/workspace";
import { cn } from "../../lib/cn";

export function InfrastructureToggles() {
  const { data: items } = useInfrastructure();
  const toggle = useToggleInfrastructure();

  if (!items) return null;

  return (
    <div className="flex gap-2">
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => toggle.mutate(item.key)}
          className={cn(
            "flex items-center gap-1.5 rounded-full border border-border bg-panel-2 px-3 py-1.5 text-sm text-text-dim",
            item.enabled && "border-ok text-text",
          )}
        >
          <span className={cn("h-2 w-2 rounded-full bg-text-dim", item.enabled && "bg-ok")} />
          {item.label}
        </button>
      ))}
    </div>
  );
}
