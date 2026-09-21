import { useState } from "react";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { useProposeAgent, type AgentDraft } from "../../lib/api/agents";

export function BuildAgentDialog({
  open,
  onOpenChange,
  onDraft,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDraft: (draft: AgentDraft) => void;
}) {
  const [brief, setBrief] = useState("");
  const proposeAgent = useProposeAgent();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    proposeAgent.mutate(
      { brief },
      {
        onSuccess: (draft) => {
          setBrief("");
          onOpenChange(false);
          onDraft(draft);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Orchestrator: build agent">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <textarea
          required
          rows={3}
          placeholder="What should this agent do?"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          className="rounded-md border border-border bg-panel-2 p-2 text-sm text-text"
        />
        {proposeAgent.isError && <p className="text-sm text-err">{proposeAgent.error.message}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={proposeAgent.isPending}>
            {proposeAgent.isPending ? "Thinking..." : "Ask"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
