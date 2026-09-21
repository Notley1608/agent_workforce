import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { useApproveJob, useCancelJob, useRejectJob } from "../../lib/api/agents";
import { useWorkflowRuns } from "../../lib/api/workflows";
import { JobTimeline } from "../agents/JobTimeline";
import { cn } from "../../lib/cn";

const NON_TERMINAL = new Set(["pending", "running", "awaiting_approval"]);

export function RunProgressDialog({
  title,
  workflowId,
  onOpenChange,
}: {
  title: string | null;
  workflowId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: runs } = useWorkflowRuns(workflowId ?? "", { live: workflowId !== null });
  const approveJob = useApproveJob();
  const rejectJob = useRejectJob();
  const cancelJob = useCancelJob();
  if (!workflowId || !title) return null;

  const run = runs?.[0];

  return (
    <Dialog open onOpenChange={onOpenChange} title={`Run: ${title}`}>
      {!run ? (
        <p className="text-sm text-text-dim">No runs yet.</p>
      ) : (
        <div className="flex flex-col gap-2 text-sm">
          {run.steps.map((step) => (
            <div key={step.id} className="rounded-md border border-border p-2">
              <div className="flex justify-between font-medium">
                <span>{step.agent_name}</span>
                <span className={cn(step.status === "failed" && "text-err", NON_TERMINAL.has(step.status) && "text-warn")}>
                  {step.status}
                </span>
              </div>
              {(step.output || step.error) && (
                <div className="mt-1 whitespace-pre-wrap text-text-dim">{step.output || step.error}</div>
              )}

              {step.status === "awaiting_approval" && (
                <div className="mt-2 flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => rejectJob.mutate(step.id)}>
                    Reject
                  </Button>
                  <Button onClick={() => approveJob.mutate(step.id)}>Approve</Button>
                </div>
              )}
              {step.status === "running" && (
                <div className="mt-2 flex justify-end">
                  <Button variant="danger" onClick={() => cancelJob.mutate(step.id)}>
                    Cancel
                  </Button>
                </div>
              )}

              <JobTimeline jobId={step.id} />
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
