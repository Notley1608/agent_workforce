import { useEffect, useState } from "react";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { useCreateAgent, type AgentDraft } from "../../lib/api/agents";

const DEFAULT_MODELS: Record<string, string> = { groq: "openai/gpt-oss-120b" };
const ROLES = ["Researcher", "Engineer", "Writer"];

const emptyForm = {
  name: "",
  role: ROLES[0],
  avatar: "🤖",
  provider: "groq",
  model: DEFAULT_MODELS.groq,
  instructions: "",
};

export function RecruitDialog({
  open,
  onOpenChange,
  initialDraft,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDraft: AgentDraft | null;
}) {
  const [form, setForm] = useState(emptyForm);
  const createAgent = useCreateAgent();

  useEffect(() => {
    if (!open) return;
    if (initialDraft) {
      const matchedRole = ROLES.find((r) => r.toLowerCase() === initialDraft.role.toLowerCase()) ?? ROLES[0];
      setForm({ ...emptyForm, name: initialDraft.name, role: matchedRole, instructions: initialDraft.instructions });
    } else {
      setForm(emptyForm);
    }
  }, [open, initialDraft]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createAgent.mutate(
      {
        name: form.name,
        role: form.role,
        role_type: initialDraft?.role_type ?? "worker",
        capabilities_override: initialDraft?.capabilities_override ?? null,
        avatar: form.avatar || "🤖",
        provider: form.provider,
        model: form.model,
        instructions: form.instructions,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Recruit an agent">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-sm">
        <label className="flex flex-col gap-1">
          Name
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="rounded-md border border-border bg-panel-2 p-2 text-text"
          />
        </label>
        <label className="flex flex-col gap-1">
          Role
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="rounded-md border border-border bg-panel-2 p-2 text-text"
          >
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Avatar
          <input
            maxLength={2}
            value={form.avatar}
            onChange={(e) => setForm({ ...form, avatar: e.target.value })}
            className="rounded-md border border-border bg-panel-2 p-2 text-text"
          />
        </label>
        <label className="flex flex-col gap-1">
          Provider
          <select
            value={form.provider}
            onChange={(e) =>
              setForm({ ...form, provider: e.target.value, model: DEFAULT_MODELS[e.target.value] ?? "" })
            }
            className="rounded-md border border-border bg-panel-2 p-2 text-text"
          >
            <option value="groq">Groq</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Model
          <input
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            className="rounded-md border border-border bg-panel-2 p-2 text-text"
          />
        </label>
        <label className="flex flex-col gap-1">
          Instructions
          <textarea
            rows={3}
            placeholder="You are a diligent researcher..."
            value={form.instructions}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
            className="rounded-md border border-border bg-panel-2 p-2 text-text"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit">Recruit</Button>
        </div>
      </form>
    </Dialog>
  );
}
