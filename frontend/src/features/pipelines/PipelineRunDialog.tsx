import { useState } from "react";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { useRunWorkflow } from "../../lib/api/workflows";
import type { Workflow } from "../../lib/schemas/workflow";

export function PipelineRunDialog({
  workflow,
  onOpenChange,
  onStarted,
}: {
  workflow: Workflow | null;
  onOpenChange: (open: boolean) => void;
  onStarted: () => void;
}) {
  const [input, setInput] = useState("");
  const runWorkflow = useRunWorkflow(workflow?.id ?? "");

  const handleClose = (open: boolean) => {
    if (!open) setInput("");
    onOpenChange(open);
  };

  if (!workflow) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runWorkflow.mutate(input, {
      onSuccess: () => {
        setInput("");
        onOpenChange(false);
        onStarted();
      },
    });
  };

  return (
    <Dialog open onOpenChange={handleClose} title={`Run "${workflow.name}"`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <textarea
          rows={3}
          required
          placeholder="Input for the first step..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="rounded-md border border-border bg-panel-2 p-2 text-sm text-text"
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={runWorkflow.isPending}>
            Run
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
