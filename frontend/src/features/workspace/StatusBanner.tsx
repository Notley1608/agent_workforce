import { cn } from "../../lib/cn";
import { useLedger } from "../../lib/api/ledger";
import { useSettings } from "../../lib/api/workspace";

export function StatusBanner() {
  const { data: ledger } = useLedger();
  const { data: settings } = useSettings();
  if (!ledger || ledger.mode === "running") return null;

  const message =
    ledger.mode === "emergency_stop"
      ? "⚠ Emergency stop is active — no new work will start until it's lifted."
      : `⚠ Recovery mode — balance $${ledger.balance.toFixed(2)} is below the $${
          settings?.recovery_threshold?.toFixed(2) ?? "?"
        } recovery threshold. New work is paused until it recovers.`;

  return (
    <p
      className={cn(
        "m-0 px-6 py-2.5 text-center text-sm",
        ledger.mode === "emergency_stop" ? "bg-err/10 text-err" : "bg-warn/10 text-warn",
      )}
    >
      {message}
    </p>
  );
}
