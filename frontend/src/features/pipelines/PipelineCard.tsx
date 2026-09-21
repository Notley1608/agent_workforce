import { Button } from "../../components/Button";
import { useAgents } from "../../lib/api/agents";
import type { Workflow } from "../../lib/schemas/workflow";

export function PipelineCard({
  workflow,
  onRun,
  onSchedule,
}: {
  workflow: Workflow;
  onRun: () => void;
  onSchedule: () => void;
}) {
  const { data: agents } = useAgents();
  const names = workflow.agent_ids.map((id) => agents?.find((a) => a.id === id)?.name ?? id);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-panel-2 p-3 text-sm">
      <p className="text-text">{workflow.name}</p>
      <p className="text-text-dim">{names.join(" → ")}</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onSchedule}>
          Schedule
        </Button>
        <Button variant="secondary" onClick={onRun}>
          Run
        </Button>
      </div>
    </div>
  );
}
