import { useState } from "react";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { useAutomations, useCreateAutomation, useDeleteAutomation, useToggleAutomation } from "../../lib/api/automations";
import type { Automation } from "../../lib/schemas/automation";
import type { Workflow } from "../../lib/schemas/workflow";

function describeAutomation(a: Automation) {
  const when = a.schedule_type === "interval" ? `every ${a.interval_minutes}m` : `daily at ${a.daily_at}`;
  const next = a.next_run_at ? new Date(a.next_run_at * 1000).toLocaleString() : "-";
  const last = a.last_run_at ? `${a.last_run_status} @ ${new Date(a.last_run_at * 1000).toLocaleString()}` : "never run";
  return { when, next, last };
}

export function AutomationDialog({ workflow, onOpenChange }: { workflow: Workflow | null; onOpenChange: (open: boolean) => void }) {
  const workflowId = workflow?.id ?? "";
  const { data: automations } = useAutomations(workflowId);
  const createAutomation = useCreateAutomation(workflowId);
  const toggleAutomation = useToggleAutomation(workflowId);
  const deleteAutomation = useDeleteAutomation(workflowId);

  const [scheduleType, setScheduleType] = useState<"interval" | "daily">("interval");
  const [intervalMinutes, setIntervalMinutes] = useState("60");
  const [dailyAt, setDailyAt] = useState("09:00");
  const [input, setInput] = useState("");

  if (!workflow) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createAutomation.mutate(
      {
        schedule_type: scheduleType,
        interval_minutes: scheduleType === "interval" ? Number(intervalMinutes) : null,
        daily_at: scheduleType === "daily" ? dailyAt : null,
        input,
      },
      { onSuccess: () => setInput("") },
    );
  };

  return (
    <Dialog open onOpenChange={onOpenChange} title={`Schedule "${workflow.name}"`}>
      <div className="flex flex-col gap-3 text-sm">
        <div className="flex flex-col gap-2">
          {!automations || automations.length === 0 ? (
            <p className="text-text-dim">No schedules yet.</p>
          ) : (
            automations.map((a) => {
              const { when, next, last } = describeAutomation(a);
              return (
                <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2">
                  <span className="text-text-dim">
                    {when} · next {next} · last: {last}
                  </span>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="secondary" onClick={() => toggleAutomation.mutate(a.id)}>
                      {a.enabled ? "Pause" : "Resume"}
                    </Button>
                    <Button variant="danger" onClick={() => deleteAutomation.mutate(a.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-2 border-t border-border pt-3">
          <select
            value={scheduleType}
            onChange={(e) => setScheduleType(e.target.value as "interval" | "daily")}
            className="rounded-md border border-border bg-panel-2 p-2 text-text"
          >
            <option value="interval">Every N minutes</option>
            <option value="daily">Daily at</option>
          </select>
          {scheduleType === "interval" ? (
            <input
              type="number"
              min={1}
              required
              value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(e.target.value)}
              className="rounded-md border border-border bg-panel-2 p-2 text-text"
            />
          ) : (
            <input
              type="time"
              required
              value={dailyAt}
              onChange={(e) => setDailyAt(e.target.value)}
              className="rounded-md border border-border bg-panel-2 p-2 text-text"
            />
          )}
          <textarea
            rows={2}
            required
            placeholder="Input for each scheduled run..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="rounded-md border border-border bg-panel-2 p-2 text-text"
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={createAutomation.isPending}>
              Add schedule
            </Button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}
