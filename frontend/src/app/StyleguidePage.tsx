import { useState } from "react";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { Eyebrow } from "../components/Eyebrow";
import { Panel } from "../components/Panel";
import { StatusIndicator } from "../components/StatusIndicator";
import { Tooltip } from "../components/Tooltip";

export function StyleguidePage() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-8">
      <div>
        <Eyebrow muted={false}>Crew</Eyebrow>
        <h1 className="text-2xl font-semibold">Design system foundation</h1>
      </div>

      <Panel className="space-y-4 p-6">
        <Eyebrow>Buttons</Eyebrow>
        <div className="flex gap-3">
          <Button variant="primary">Recruit agent</Button>
          <Button variant="secondary">Cancel</Button>
          <Button variant="danger">Emergency stop</Button>
        </div>
      </Panel>

      <Panel className="space-y-4 p-6">
        <Eyebrow>Status & badges</Eyebrow>
        <div className="flex flex-wrap items-center gap-4">
          <StatusIndicator status="ok" label="idle" />
          <StatusIndicator status="warn" label="working" />
          <StatusIndicator status="err" label="failed" />
          <Badge tone="ok">success</Badge>
          <Badge tone="err">failure</Badge>
          <Badge tone="accent">research</Badge>
        </div>
      </Panel>

      <Panel className="space-y-4 p-6">
        <Eyebrow>Overlays</Eyebrow>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Open dialog
          </Button>
          <Tooltip content="Assign a task to this agent">
            <Button variant="secondary">Hover me</Button>
          </Tooltip>
        </div>
      </Panel>

      <Panel className="flex gap-6 p-6">
        <div>
          <Eyebrow muted={false} className="text-research">
            Research campus
          </Eyebrow>
        </div>
        <div>
          <Eyebrow muted={false} className="text-worker">
            Worker campus
          </Eyebrow>
        </div>
      </Panel>

      <Dialog open={open} onOpenChange={setOpen} title="Recruit an agent">
        <p className="text-sm text-text-dim">Dialog content placeholder — migrated in the agents feature slice.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => setOpen(false)}>
            Recruit
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
