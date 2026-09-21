import { useState } from "react";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { useDiscoverOpportunities } from "../../lib/api/opportunities";

export function DiscoverDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [hint, setHint] = useState("");
  const discover = useDiscoverOpportunities();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    discover.mutate({ hint }, { onSuccess: () => { setHint(""); onOpenChange(false); } });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Ask the Orchestrator to discover opportunities">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <textarea
          rows={3}
          placeholder="Any hint about where to look? (optional)"
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          className="rounded-md border border-border bg-panel-2 p-2 text-sm text-text"
        />
        {discover.isError && <p className="text-sm text-err">{discover.error.message}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={discover.isPending}>
            {discover.isPending ? "Thinking..." : "Discover"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
