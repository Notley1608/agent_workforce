import { useUsage } from "../../lib/api/workspace";

export function UsageBadge() {
  const { data: usage } = useUsage();
  if (!usage) return null;
  return <span className="text-sm text-text-dim">${usage.today_cost.toFixed(4)} today</span>;
}
