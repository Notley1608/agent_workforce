import type { Agent } from "../lib/schemas/agent";
import { AgentSprite } from "./AgentSprite";
import { CampusZone } from "./CampusZone";
import { layoutSlots } from "./positions";

export function VillageScene({ agents, onSelectAgent }: { agents: Agent[]; onSelectAgent: (agent: Agent) => void }) {
  const researchers = agents.filter((a) => a.role_type === "researcher");
  const workers = agents.filter((a) => a.role_type === "worker");
  const researchSlots = layoutSlots(researchers.map((a) => a.id));
  const workerSlots = layoutSlots(workers.map((a) => a.id));

  return (
    <div className="relative h-[480px] w-full overflow-hidden rounded-[10px] border border-border bg-bg">
      <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-md border border-accent/40 bg-panel px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent">
        🏛 Orchestrator Town Hall
      </div>

      <CampusZone label="Research Campus" tone="research" className="left-3 top-16 bottom-3 w-[calc(50%-24px)]">
        {researchers.map((agent) => {
          const { leftPct, topPct } = researchSlots.get(agent.id)!;
          return <AgentSprite key={agent.id} agent={agent} leftPct={leftPct} topPct={topPct} onClick={() => onSelectAgent(agent)} />;
        })}
      </CampusZone>

      <CampusZone label="Worker Campus" tone="worker" className="right-3 top-16 bottom-3 w-[calc(50%-24px)]">
        {workers.map((agent) => {
          const { leftPct, topPct } = workerSlots.get(agent.id)!;
          return <AgentSprite key={agent.id} agent={agent} leftPct={leftPct} topPct={topPct} onClick={() => onSelectAgent(agent)} />;
        })}
      </CampusZone>

      {agents.length === 0 && (
        <p className="absolute inset-0 flex items-center justify-center text-text-dim">
          No one on floor yet. Recruit your first agent.
        </p>
      )}
    </div>
  );
}
