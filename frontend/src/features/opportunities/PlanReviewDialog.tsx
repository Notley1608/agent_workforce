import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { useApprovePlan, useRejectPlan } from "../../lib/api/plans";
import type { Plan } from "../../lib/schemas/plan";

export function PlanReviewDialog({
  plan,
  onOpenChange,
  onApproved,
}: {
  plan: Plan | null;
  onOpenChange: (open: boolean) => void;
  onApproved?: (result: { workflow_id: string; run_id: string }) => void;
}) {
  const approvePlan = useApprovePlan();
  const rejectPlan = useRejectPlan();
  if (!plan) return null;

  return (
    <Dialog open onOpenChange={onOpenChange} title="Proposed plan">
      <div className="flex flex-col gap-3 text-sm">
        <p>{plan.summary}</p>
        <ol className="list-decimal space-y-1 pl-5">
          {plan.steps.map((step, i) => (
            <li key={i}>
              <b>{step.name}</b> ({step.role}) — {step.instructions}
            </li>
          ))}
        </ol>
        {plan.warnings.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-warn">
            {plan.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
        {plan.status !== "proposed" ? (
          <p className="text-text-dim">Plan {plan.status}.</p>
        ) : (
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => rejectPlan.mutate(plan.id, { onSuccess: () => onOpenChange(false) })}
            >
              Reject
            </Button>
            <Button
              onClick={() =>
                approvePlan.mutate(plan.id, {
                  onSuccess: (result) => {
                    onOpenChange(false);
                    onApproved?.(result);
                  },
                })
              }
            >
              Approve
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
