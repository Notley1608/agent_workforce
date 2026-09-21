import { useState } from "react";
import { Button } from "../../components/Button";
import { useOpportunities } from "../../lib/api/opportunities";
import { useProposePlan } from "../../lib/api/plans";
import type { Opportunity } from "../../lib/schemas/opportunity";
import type { Plan } from "../../lib/schemas/plan";
import { DiscoverDialog } from "./DiscoverDialog";
import { LearningDialog } from "./LearningDialog";
import { NewOpportunityDialog } from "./NewOpportunityDialog";
import { OpportunityCard } from "./OpportunityCard";
import { PlanReviewDialog } from "./PlanReviewDialog";
import { RevenueDialog } from "./RevenueDialog";
import { RunProgressDialog } from "./RunProgressDialog";

// One column per status actually in use, in lifecycle order, rather than a
// fixed list of every possible status — keeps the board from being mostly
// empty columns in a small workspace.
const STATUS_ORDER = [
  "discovered", "researching", "validating", "refined", "awaiting_approval",
  "approved", "queued", "assigned", "executing", "paused",
  "success", "failure", "measuring_outcome", "learned",
];

export function OpportunityBoard() {
  const { data: opportunities } = useOpportunities();
  const proposePlan = useProposePlan();

  const [newOpen, setNewOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [planningId, setPlanningId] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [revenueTarget, setRevenueTarget] = useState<Opportunity | null>(null);
  const [learningTarget, setLearningTarget] = useState<Opportunity | null>(null);
  const [runTarget, setRunTarget] = useState<Opportunity | null>(null);

  const handlePlan = (opp: Opportunity) => {
    setPlanningId(opp.id);
    proposePlan.mutate(
      { objective: opp.description || opp.title, opportunity_id: opp.id },
      { onSuccess: (p) => setPlan(p), onSettled: () => setPlanningId(null) },
    );
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-end">
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setDiscoverOpen(true)}>
            Discover
          </Button>
          <Button onClick={() => setNewOpen(true)}>+ New opportunity</Button>
        </div>
      </div>

      {!opportunities || opportunities.length === 0 ? (
        <p className="text-text-dim">No opportunities yet. Let the Orchestrator find some, or add one yourself.</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {STATUS_ORDER.filter((status) => opportunities.some((o) => o.status === status)).map((status) => {
            const inStatus = opportunities.filter((o) => o.status === status);
            const forecastTotal = inStatus.reduce((sum, o) => sum + (o.forecast_value || 0), 0);
            return (
              <div key={status} className="w-64 shrink-0">
                <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-text-dim">
                  <span>
                    {status} <span className="text-text">{inStatus.length}</span>
                  </span>
                  {forecastTotal > 0 && <span>est. ${forecastTotal.toFixed(0)}</span>}
                </div>
                <div className="flex flex-col gap-2">
                  {inStatus.map((opp) => (
                    <OpportunityCard
                      key={opp.id}
                      opportunity={opp}
                      planning={planningId === opp.id}
                      onPlan={() => handlePlan(opp)}
                      onViewRun={() => setRunTarget(opp)}
                      onRecordRevenue={() => setRevenueTarget(opp)}
                      onRecordLearning={() => setLearningTarget(opp)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <NewOpportunityDialog open={newOpen} onOpenChange={setNewOpen} />
      <DiscoverDialog open={discoverOpen} onOpenChange={setDiscoverOpen} />
      <PlanReviewDialog plan={plan} onOpenChange={(open) => !open && setPlan(null)} />
      <RevenueDialog opportunity={revenueTarget} onOpenChange={(open) => !open && setRevenueTarget(null)} />
      <LearningDialog opportunity={learningTarget} onOpenChange={(open) => !open && setLearningTarget(null)} />
      <RunProgressDialog
        title={runTarget?.title ?? null}
        workflowId={runTarget?.workflow_id ?? null}
        onOpenChange={(open) => !open && setRunTarget(null)}
      />
    </div>
  );
}
