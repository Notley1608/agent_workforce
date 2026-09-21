import { Dialog } from "../../components/Dialog";
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
              <JobTimeline jobId={step.id} />
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
