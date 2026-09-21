import { useEffect, useState } from "react";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { useSettings, useUpdateSettings } from "../../lib/api/workspace";

function NumberField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number | null;
  onCommit: (value: number | null) => void;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));

  useEffect(() => {
    setText(value === null ? "" : String(value));
  }, [value]);

  return (
    <label className="flex items-center gap-1 text-sm text-text-dim">
      {label} $
      <input
        type="number"
        min={0}
        step={0.01}
        placeholder="none"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onCommit(text === "" ? null : Number(text))}
        className="w-20 rounded-md border border-border bg-panel-2 px-2 py-1 text-text"
      />
    </label>
  );
}

export function SettingsControls() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!settings) return null;

  const handleEmergencyStopClick = () => {
    if (!settings.emergency_stop) {
      setConfirmOpen(true);
    } else {
      updateSettings.mutate({ emergency_stop: false });
    }
  };

  return (
    <>
      <NumberField
        label="Daily budget"
        value={settings.daily_spend_limit}
        onCommit={(daily_limit) => updateSettings.mutate({ daily_limit })}
      />
      <NumberField
        label="Recovery below"
        value={settings.recovery_threshold}
        onCommit={(recovery_threshold) => updateSettings.mutate({ recovery_threshold })}
      />
      <Button variant={settings.emergency_stop ? "danger" : "secondary"} onClick={handleEmergencyStopClick}>
        {settings.emergency_stop ? "Resume work" : "Emergency stop"}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen} title="Emergency stop">
        <p className="text-sm text-text-dim">Stop all new agent work until you resume?</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              updateSettings.mutate({ emergency_stop: true });
              setConfirmOpen(false);
            }}
          >
            Stop work
          </Button>
        </div>
      </Dialog>
    </>
  );
}
