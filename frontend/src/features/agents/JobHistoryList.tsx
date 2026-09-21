import { useState } from "react";
import { useAgentJobs } from "../../lib/api/agents";
import { JobTimeline } from "./JobTimeline";
import { cn } from "../../lib/cn";

export function JobHistoryList({ agentId }: { agentId: string }) {
  const { data: jobs } = useAgentJobs(agentId);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (!jobs) return null;

  return (
    <div>
      {jobs.map((job) => (
        <details
          key={job.id}
          className="mb-1.5 rounded-md border border-border p-2 text-sm"
          onToggle={(e) => {
            const isOpen = e.currentTarget.open;
            setExpanded((prev) => {
              const next = new Set(prev);
              isOpen ? next.add(job.id) : next.delete(job.id);
              return next;
            });
          }}
        >
          <summary className={cn("cursor-pointer", job.status === "failed" && "text-err")}>
            [{job.status}] {job.input}
          </summary>
          {expanded.has(job.id) && (
            <div className="mt-1.5 whitespace-pre-wrap">
              {job.output || job.error || ""}
              <JobTimeline jobId={job.id} />
            </div>
          )}
        </details>
      ))}
    </div>
  );
}
