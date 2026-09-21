import { useState } from "react";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { useCreateOpportunity } from "../../lib/api/opportunities";

const empty = { title: "", description: "", forecast_value: "" };

export function NewOpportunityDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [form, setForm] = useState(empty);
  const createOpportunity = useCreateOpportunity();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createOpportunity.mutate(
      {
        title: form.title,
        description: form.description,
        forecast_value: form.forecast_value ? Number(form.forecast_value) : null,
      },
      { onSuccess: () => { setForm(empty); onOpenChange(false); } },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New opportunity">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-sm">
        <label className="flex flex-col gap-1">
          Title
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="rounded-md border border-border bg-panel-2 p-2 text-text"
          />
        </label>
        <label className="flex flex-col gap-1">
          Description
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="rounded-md border border-border bg-panel-2 p-2 text-text"
          />
        </label>
        <label className="flex flex-col gap-1">
          Forecast value (USD)
          <input
            type="number"
            step="any"
            value={form.forecast_value}
            onChange={(e) => setForm({ ...form, forecast_value: e.target.value })}
            className="rounded-md border border-border bg-panel-2 p-2 text-text"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit">Add</Button>
        </div>
      </form>
    </Dialog>
  );
}
