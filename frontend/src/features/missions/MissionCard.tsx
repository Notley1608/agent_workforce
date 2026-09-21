import { Button } from "../../components/Button";
import { useRunWorkflow } from "../../lib/api/workflows";
import { cn } from "../../lib/cn";
import type { Plan } from "../../lib/schemas/plan";

const STATUS_TONE = {
  proposed: "text-warn",
  approved: "text-ok",
  rejected: "text-err",
};

export function MissionCard({
  plan,
  onReview,
  onViewRun,
}: {
  plan: Plan;
  onReview: () => void;
  onViewRun: () => void;
}) {
  const runWorkflow = useRunWorkflow(plan.workflow_id ?? "");

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-panel-2 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-text">{plan.objective}</p>
        <span className={cn("shrink-0 text-xs font-semibold uppercase tracking-wider", STATUS_TONE[plan.status])}>
          {plan.status}
        </span>
      </div>
      <div className="flex justify-end gap-2">
        {plan.status === "proposed" && (
          <Button variant="secondary" onClick={onReview}>
            Review
          </Button>
        )}
        {plan.status === "approved" && plan.workflow_id && (
          <>
            <Button variant="secondary" onClick={onViewRun}>
              View run
            </Button>
            <Button
              variant="secondary"
              disabled={runWorkflow.isPending}
              onClick={() => runWorkflow.mutate(plan.objective, { onSuccess: onViewRun })}
            >
              Run again
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
