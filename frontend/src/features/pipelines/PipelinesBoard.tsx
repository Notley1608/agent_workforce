import { useState } from "react";
import { Button } from "../../components/Button";
import { useWorkflows } from "../../lib/api/workflows";
import type { Workflow } from "../../lib/schemas/workflow";
import { RunProgressDialog } from "../opportunities/RunProgressDialog";
import { AutomationDialog } from "./AutomationDialog";
import { NewPipelineDialog } from "./NewPipelineDialog";
import { PipelineCard } from "./PipelineCard";
import { PipelineRunDialog } from "./PipelineRunDialog";

export function PipelinesBoard() {
  const { data: workflows } = useWorkflows();
  const [newOpen, setNewOpen] = useState(false);
  const [runTarget, setRunTarget] = useState<Workflow | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<Workflow | null>(null);
  const [activeRun, setActiveRun] = useState<{ title: string; workflowId: string } | null>(null);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setNewOpen(true)}>+ New pipeline</Button>
      </div>

      {!workflows || workflows.length === 0 ? (
        <p className="text-text-dim">No pipelines yet. Chain agents together with "+ New pipeline".</p>
      ) : (
        <div className="flex flex-col gap-2">
          {workflows.map((wf) => (
            <PipelineCard key={wf.id} workflow={wf} onRun={() => setRunTarget(wf)} onSchedule={() => setScheduleTarget(wf)} />
          ))}
        </div>
      )}

      <NewPipelineDialog open={newOpen} onOpenChange={setNewOpen} />
      <PipelineRunDialog
        workflow={runTarget}
        onOpenChange={(open) => !open && setRunTarget(null)}
        onStarted={() => runTarget && setActiveRun({ title: runTarget.name, workflowId: runTarget.id })}
      />
      <AutomationDialog workflow={scheduleTarget} onOpenChange={(open) => !open && setScheduleTarget(null)} />
      <RunProgressDialog
        title={activeRun?.title ?? null}
        workflowId={activeRun?.workflowId ?? null}
        onOpenChange={(open) => !open && setActiveRun(null)}
      />
    </div>
  );
}
