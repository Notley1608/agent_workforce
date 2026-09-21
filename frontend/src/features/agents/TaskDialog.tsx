import { useState } from "react";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import {
  useAgentJobs,
  useApproveJob,
  useAssignTask,
  useCancelJob,
  useRejectJob,
} from "../../lib/api/agents";
import type { Agent } from "../../lib/schemas/agent";
import { JobHistoryList } from "./JobHistoryList";
import { JobTimeline } from "./JobTimeline";

const NON_TERMINAL = new Set(["pending", "running", "awaiting_approval"]);

export function TaskDialog({ agent, onOpenChange }: { agent: Agent | null; onOpenChange: (open: boolean) => void }) {
  const [input, setInput] = useState("");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  const assignTask = useAssignTask(agent?.id ?? "");
  const cancelJob = useCancelJob();
  const approveJob = useApproveJob();
  const rejectJob = useRejectJob();

  const { data: jobs } = useAgentJobs(agent?.id ?? "", { live: activeJobId !== null });
  const activeJob = jobs?.find((j) => j.id === activeJobId) ?? null;

  const handleClose = (open: boolean) => {
    if (!open) {
      setInput("");
      setActiveJobId(null);
      setAssignError(null);
    }
    onOpenChange(open);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAssignError(null);
    assignTask.mutate(
      { input },
      {
        onSuccess: (res) => setActiveJobId(res.job_id),
        onError: (err) => setAssignError(err.message),
      },
    );
  };

  if (!agent) return null;

  return (
    <Dialog open onOpenChange={handleClose} title={`Assign a task to ${agent.name}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <textarea
          name="input"
          rows={3}
          required
          placeholder="Research the top 5 competitors and summarize them."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="rounded-md border border-border bg-panel-2 p-2 text-sm text-text"
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={activeJob !== null && NON_TERMINAL.has(activeJob.status)}>
            Assign
          </Button>
        </div>
      </form>

      {assignError && <p className="mt-2 text-sm text-err">{assignError}</p>}

      {activeJob && (
        <div className="mt-4 flex flex-col gap-2 text-sm">
          {NON_TERMINAL.has(activeJob.status) && activeJob.status !== "awaiting_approval" && (
            <div className="flex items-center justify-between">
              <span>Working...</span>
              <Button variant="danger" onClick={() => cancelJob.mutate(activeJob.id)}>
                Cancel task
              </Button>
            </div>
          )}

          {activeJob.status === "awaiting_approval" && (
            <div>
              <p className="whitespace-pre-wrap">{activeJob.output || ""}</p>
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="secondary" onClick={() => rejectJob.mutate(activeJob.id)}>
                  Reject
                </Button>
                <Button onClick={() => approveJob.mutate(activeJob.id)}>Approve</Button>
              </div>
            </div>
          )}

          {activeJob.status === "completed" && (
            <div className="whitespace-pre-wrap">
              {activeJob.output}
              {activeJob.tools_used.length > 0 && (
                <div className="mt-2 text-xs text-text-dim">{activeJob.tools_used.join(" · ")}</div>
              )}
              <JobTimeline jobId={activeJob.id} />
            </div>
          )}

          {(activeJob.status === "failed" || activeJob.status === "cancelled") && (
            <div className="text-err">
              {activeJob.status === "cancelled" ? "Cancelled." : activeJob.error}
              <JobTimeline jobId={activeJob.id} />
            </div>
          )}
        </div>
      )}

      <h3 className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wider text-text-dim">History</h3>
      <JobHistoryList agentId={agent.id} />
    </Dialog>
  );
}
