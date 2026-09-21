import { useState } from "react";
import { Button } from "../../components/Button";
import { usePlans } from "../../lib/api/plans";
import type { Plan } from "../../lib/schemas/plan";
import { PlanReviewDialog } from "../opportunities/PlanReviewDialog";
import { RunProgressDialog } from "../opportunities/RunProgressDialog";
import { MissionCard } from "./MissionCard";
import { NewMissionDialog } from "./NewMissionDialog";

export function MissionsBoard() {
  const { data: plans } = usePlans();
  const [newOpen, setNewOpen] = useState(false);
  const [reviewPlan, setReviewPlan] = useState<Plan | null>(null);
  const [runTarget, setRunTarget] = useState<{ title: string; workflowId: string } | null>(null);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setNewOpen(true)}>+ New mission</Button>
      </div>

      {!plans || plans.length === 0 ? (
        <p className="text-text-dim">No missions yet. Give the workforce an objective with "+ New mission".</p>
      ) : (
        <div className="flex flex-col gap-2">
          {plans.map((plan) => (
            <MissionCard
              key={plan.id}
              plan={plan}
              onReview={() => setReviewPlan(plan)}
              onViewRun={() => plan.workflow_id && setRunTarget({ title: plan.objective, workflowId: plan.workflow_id })}
            />
          ))}
        </div>
      )}

      <NewMissionDialog open={newOpen} onOpenChange={setNewOpen} onPlanCreated={setReviewPlan} />
      <PlanReviewDialog
        plan={reviewPlan}
        onOpenChange={(open) => !open && setReviewPlan(null)}
        onApproved={(result) => reviewPlan && setRunTarget({ title: reviewPlan.objective, workflowId: result.workflow_id })}
      />
      <RunProgressDialog
        title={runTarget?.title ?? null}
        workflowId={runTarget?.workflowId ?? null}
        onOpenChange={(open) => !open && setRunTarget(null)}
      />
    </div>
  );
}
