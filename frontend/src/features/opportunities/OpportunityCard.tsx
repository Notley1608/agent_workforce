import { Panel } from "../../components/Panel";
import { Button } from "../../components/Button";
import type { Opportunity } from "../../lib/schemas/opportunity";

const LEARNABLE_STATUSES = new Set(["success", "failure", "learned"]);

export function OpportunityCard({
  opportunity,
  onPlan,
  onViewRun,
  onRecordRevenue,
  onRecordLearning,
  planning,
}: {
  opportunity: Opportunity;
  onPlan: () => void;
  onViewRun: () => void;
  onRecordRevenue: () => void;
  onRecordLearning: () => void;
  planning: boolean;
}) {
  return (
    <Panel className="p-3 text-sm">
      <div className="font-semibold">{opportunity.title}</div>
      <div className="text-xs text-text-dim">
        {opportunity.status}
        {opportunity.forecast_value ? ` · est. $${opportunity.forecast_value}` : ""}
      </div>
      <div className="mt-1 text-xs text-text-dim">{opportunity.description}</div>
      {opportunity.notes && <div className="mt-1 text-xs text-accent">Learned: {opportunity.notes}</div>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {!opportunity.workflow_id ? (
          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={onPlan} disabled={planning}>
            {planning ? "Thinking..." : "Plan"}
          </Button>
        ) : (
          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={onViewRun}>
            View run
          </Button>
        )}
        <Button variant="secondary" className="px-2 py-1 text-xs" onClick={onRecordRevenue}>
          Record revenue
        </Button>
        {LEARNABLE_STATUSES.has(opportunity.status) && (
          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={onRecordLearning}>
            {opportunity.notes ? "Edit learning" : "Record learning"}
          </Button>
        )}
      </div>
    </Panel>
  );
}
