import { useState } from "react";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { cn } from "../../lib/cn";
import { useProposeAgent, type AgentDraft } from "../../lib/api/agents";
import { useProposePlan } from "../../lib/api/plans";
import { useAskOrchestrator, useOrchestratorMessages } from "../../lib/api/workspace";
import type { Plan } from "../../lib/schemas/plan";
import { RecruitDialog } from "../agents/RecruitDialog";
import { PlanReviewDialog } from "../opportunities/PlanReviewDialog";
import { RunProgressDialog } from "../opportunities/RunProgressDialog";

type Mode = "ask" | "recruit" | "mission";

const MODE_LABELS: Record<Mode, string> = {
  ask: "Ask",
  recruit: "Recruit an agent",
  mission: "Propose a mission",
};

const MODE_PLACEHOLDERS: Record<Mode, string> = {
  ask: "e.g. how much have we spent today?",
  recruit: "e.g. someone to monitor competitor pricing",
  mission: "e.g. grow newsletter signups this month",
};

type Turn =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "orchestrator"; text: string; agentDraft?: AgentDraft; plan?: Plan }
  | { id: string; role: "orchestrator"; error: string };

export function OrchestratorChat({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [mode, setMode] = useState<Mode>("ask");
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);

  const [recruitOpen, setRecruitOpen] = useState(false);
  const [draft, setDraft] = useState<AgentDraft | null>(null);
  const [reviewPlan, setReviewPlan] = useState<Plan | null>(null);
  const [runTarget, setRunTarget] = useState<{ title: string; workflowId: string } | null>(null);

  const { data: messages } = useOrchestratorMessages();
  const askOrchestrator = useAskOrchestrator();
  const proposeAgent = useProposeAgent();
  const proposePlan = useProposePlan();
  const pending = askOrchestrator.isPending || proposeAgent.isPending || proposePlan.isPending;

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");

    if (mode === "ask") {
      askOrchestrator.mutate(text);
      return;
    }

    const userTurn: Turn = { id: crypto.randomUUID(), role: "user", text };
    if (mode === "recruit") {
      proposeAgent.mutate(
        { brief: text },
        {
          onSuccess: (agentDraft) =>
            setTurns((t) => [
              ...t,
              userTurn,
              { id: crypto.randomUUID(), role: "orchestrator", text: `Drafted "${agentDraft.name}" — ${agentDraft.instructions}`, agentDraft },
            ]),
          onError: (err) => setTurns((t) => [...t, userTurn, { id: crypto.randomUUID(), role: "orchestrator", error: (err as Error).message }]),
        },
      );
    } else {
      proposePlan.mutate(
        { objective: text },
        {
          onSuccess: (plan) =>
            setTurns((t) => [...t, userTurn, { id: crypto.randomUUID(), role: "orchestrator", text: plan.summary, plan }]),
          onError: (err) => setTurns((t) => [...t, userTurn, { id: crypto.randomUUID(), role: "orchestrator", error: (err as Error).message }]),
        },
      );
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange} title="🏛 Talk to the Orchestrator" className="w-[min(640px,95vw)]">
        <div className="flex flex-col gap-3">
          <div className="flex gap-1.5 text-xs">
            {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn("rounded-full border px-2.5 py-1", mode === m ? "border-accent bg-accent/10 text-accent" : "border-border text-text-dim")}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>

          <div className="flex max-h-96 flex-col gap-2 overflow-y-auto text-sm">
            {mode === "ask" ? (
              !messages || messages.length === 0 ? (
                <p className="text-text-dim">Ask anything about the workspace — spend, opportunities, agents.</p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn("rounded-md p-2", m.role === "owner" ? "self-end bg-accent/15 text-text" : "bg-panel-2 text-text")}
                  >
                    {m.content}
                  </div>
                ))
              )
            ) : (
              <>
                {turns.length === 0 && (
                  <p className="text-text-dim">
                    {mode === "recruit" ? "Describe an agent and I'll draft one." : "Give me an objective and I'll propose a plan."}
                  </p>
                )}
                {turns.map((turn) =>
                  turn.role === "user" ? (
                    <div key={turn.id} className="self-end rounded-md bg-accent/15 p-2 text-text">
                      {turn.text}
                    </div>
                  ) : "error" in turn ? (
                    <div key={turn.id} className="rounded-md bg-panel-2 p-2 text-err">
                      {turn.error}
                    </div>
                  ) : (
                    <div key={turn.id} className="rounded-md bg-panel-2 p-2 text-text">
                      <p>{turn.text}</p>
                      {turn.agentDraft && (
                        <Button
                          className="mt-2"
                          variant="secondary"
                          onClick={() => {
                            setDraft(turn.agentDraft!);
                            setRecruitOpen(true);
                          }}
                        >
                          Recruit this agent
                        </Button>
                      )}
                      {turn.plan && (
                        <Button className="mt-2" variant="secondary" onClick={() => setReviewPlan(turn.plan!)}>
                          Review plan
                        </Button>
                      )}
                    </div>
                  ),
                )}
              </>
            )}
          </div>

          <form onSubmit={handleSend} className="flex gap-2">
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={MODE_PLACEHOLDERS[mode]}
              className="flex-1 rounded-md border border-border bg-panel-2 p-2 text-sm text-text"
            />
            <Button type="submit" disabled={pending}>
              {pending ? "Thinking…" : "Send"}
            </Button>
          </form>
        </div>
      </Dialog>

      <RecruitDialog open={recruitOpen} onOpenChange={setRecruitOpen} initialDraft={draft} />
      <PlanReviewDialog
        plan={reviewPlan}
        onOpenChange={(open) => !open && setReviewPlan(null)}
        onApproved={(result) => reviewPlan && setRunTarget({ title: reviewPlan.objective, workflowId: result.workflow_id })}
      />
      <RunProgressDialog
        title={runTarget?.title ?? null}
        workflowId={runTarget?.workflowId ?? null}
        onOpenChange={(open) => !open && setRunTarget(null)}
      />
    </>
  );
}
