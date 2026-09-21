import { useState } from "react";
import { Button } from "../../components/Button";
import { useAgents, type AgentDraft } from "../../lib/api/agents";
import type { Agent } from "../../lib/schemas/agent";
import { VillageScene } from "../../world/VillageScene";
import { BuildAgentDialog } from "./BuildAgentDialog";
import { RecruitDialog } from "./RecruitDialog";
import { TaskDialog } from "./TaskDialog";

export function AgentRoster() {
  const { data: agents } = useAgents();
  const [recruitOpen, setRecruitOpen] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);
  const [draft, setDraft] = useState<AgentDraft | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <Button variant="secondary" onClick={() => setBuildOpen(true)}>
          🧭 Orchestrator: build agent
        </Button>
        <Button
          onClick={() => {
            setDraft(null);
            setRecruitOpen(true);
          }}
        >
          + Recruit agent
        </Button>
      </div>

      <VillageScene agents={agents ?? []} onSelectAgent={setSelectedAgent} />

      <RecruitDialog open={recruitOpen} onOpenChange={setRecruitOpen} initialDraft={draft} />
      <BuildAgentDialog
        open={buildOpen}
        onOpenChange={setBuildOpen}
        onDraft={(d) => {
          setDraft(d);
          setRecruitOpen(true);
        }}
      />
      <TaskDialog agent={selectedAgent} onOpenChange={(open) => !open && setSelectedAgent(null)} />
    </div>
  );
}
