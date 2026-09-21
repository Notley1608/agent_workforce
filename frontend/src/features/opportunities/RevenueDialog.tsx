import { useState } from "react";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { useRecordRevenue } from "../../lib/api/opportunities";
import type { Opportunity } from "../../lib/schemas/opportunity";

export function RevenueDialog({ opportunity, onOpenChange }: { opportunity: Opportunity | null; onOpenChange: (open: boolean) => void }) {
  const [amount, setAmount] = useState("");
  const recordRevenue = useRecordRevenue(opportunity?.id ?? "");

  if (!opportunity) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value)) return;
    recordRevenue.mutate({ amount: value }, { onSuccess: () => { setAmount(""); onOpenChange(false); } });
  };

  return (
    <Dialog open onOpenChange={onOpenChange} title={`Revenue from "${opportunity.title}"`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Amount earned so far (USD)
          <input
            type="number"
            step="any"
            required
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="rounded-md border border-border bg-panel-2 p-2 text-text"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit">Record</Button>
        </div>
      </form>
    </Dialog>
  );
}
