import { useState } from "react";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { useProposePlan } from "../../lib/api/plans";
import type { Plan } from "../../lib/schemas/plan";

// Starter recipes: a few ready-made objectives so a new user has something to
// click instead of staring at a blank textarea. Pure content, no backend.
const OBJECTIVE_TEMPLATES = [
  "Research the top 3 competitors for [product] and summarize their pricing.",
  "Summarize this week's news about [topic] into a short brief.",
  "Draft a week's worth of social media post ideas for [topic].",
  "Write a README draft for [project] and save it to disk.",
];

export function NewMissionDialog({
  open,
  onOpenChange,
  onPlanCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPlanCreated: (plan: Plan) => void;
}) {
  const [objective, setObjective] = useState("");
  const proposePlan = useProposePlan();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    proposePlan.mutate(
      { objective },
      {
        onSuccess: (plan) => {
          setObjective("");
          onOpenChange(false);
          onPlanCreated(plan);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New mission">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-sm">
        <div className="flex flex-wrap gap-1.5">
          {OBJECTIVE_TEMPLATES.map((template) => (
            <button
              key={template}
              type="button"
              onClick={() => setObjective(template)}
              className="rounded-full border border-border bg-panel-2 px-2 py-1 text-left text-xs text-text-dim hover:border-accent hover:text-text"
            >
              {template}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1">
          Objective
          <textarea
            required
            rows={4}
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            className="rounded-md border border-border bg-panel-2 p-2 text-text"
          />
        </label>
        {proposePlan.isError && <p className="text-err">{(proposePlan.error as Error).message}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={proposePlan.isPending}>
            {proposePlan.isPending ? "Thinking…" : "Propose plan"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
