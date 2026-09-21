import { cn } from "../../lib/cn";
import { useLedger } from "../../lib/api/ledger";

export function FinancialHUD() {
  const { data: ledger } = useLedger();
  if (!ledger) return null;

  const net = ledger.total_revenue - ledger.total_cost;
  const netTone =
    ledger.mode === "emergency_stop" ? "text-err" : ledger.mode === "recovery" ? "text-warn" : "text-text";

  return (
    <div role="group" aria-label="Financial state" className="flex gap-3.5 text-sm text-text-dim">
      <span>
        <b className="font-semibold text-text">${ledger.total_revenue.toFixed(2)}</b> revenue
      </span>
      <span>
        <b className="font-semibold text-text">${ledger.total_cost.toFixed(2)}</b> costs
      </span>
      <span>
        <b className={cn("font-semibold", netTone)}>
          {net >= 0 ? "+" : "-"}${Math.abs(net).toFixed(2)}
        </b>{" "}
        net
      </span>
    </div>
  );
}
