import { useEffect, useState } from "react";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { useRecordLearning } from "../../lib/api/opportunities";
import type { Opportunity } from "../../lib/schemas/opportunity";

export function LearningDialog({ opportunity, onOpenChange }: { opportunity: Opportunity | null; onOpenChange: (open: boolean) => void }) {
  const [note, setNote] = useState("");
  const recordLearning = useRecordLearning(opportunity?.id ?? "");

  useEffect(() => {
    if (opportunity) setNote(opportunity.notes ?? "");
  }, [opportunity]);

  if (!opportunity) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    recordLearning.mutate(note, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open onOpenChange={onOpenChange} title={`What did we learn from "${opportunity.title}"?`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <textarea
          rows={4}
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="rounded-md border border-border bg-panel-2 p-2 text-sm text-text"
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Dialog>
  );
}
