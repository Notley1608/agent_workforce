import { useState } from "react";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { useAgents } from "../../lib/api/agents";
import { useCreateWorkflow } from "../../lib/api/workflows";

export function NewPipelineDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: agents } = useAgents();
  const createWorkflow = useCreateWorkflow();
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<string[]>([""]);

  const reset = () => {
    setName("");
    setSteps([""]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createWorkflow.mutate(
      { name, agent_ids: steps.filter(Boolean) },
      { onSuccess: () => { reset(); onOpenChange(false); } },
    );
  };

  if (!agents || agents.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange} title="New pipeline">
        <p className="text-sm text-text-dim">Recruit at least one agent before building a pipeline.</p>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New pipeline">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-sm">
        <label className="flex flex-col gap-1">
          Name
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-border bg-panel-2 p-2 text-text"
          />
        </label>

        <div className="flex flex-col gap-2">
          {steps.map((agentId, i) => (
            <div key={i} className="flex gap-2">
              <select
                required
                value={agentId}
                onChange={(e) => setSteps(steps.map((s, si) => (si === i ? e.target.value : s)))}
                className="flex-1 rounded-md border border-border bg-panel-2 p-2 text-text"
              >
                <option value="" disabled>
                  Choose an agent
                </option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.role})
                  </option>
                ))}
              </select>
              {steps.length > 1 && (
                <Button type="button" variant="secondary" onClick={() => setSteps(steps.filter((_, si) => si !== i))}>
                  Remove
                </Button>
              )}
            </div>
          ))}
          <Button type="button" variant="secondary" onClick={() => setSteps([...steps, ""])}>
            + Add step
          </Button>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit">Create</Button>
        </div>
      </form>
    </Dialog>
  );
}
