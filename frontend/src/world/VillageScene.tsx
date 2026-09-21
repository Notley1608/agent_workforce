import { useActivity } from "../lib/api/workspace";
import type { Agent } from "../lib/schemas/agent";
import { AgentSprite } from "./AgentSprite";
import { Building } from "./Building";
import { CampusZone } from "./CampusZone";
import { DESK_BAND, layoutSlots, YARD_BAND } from "./positions";

const SCENERY = [
  { icon: "🌳", left: "4%", top: "10%" },
  { icon: "🌲", left: "94%", top: "14%" },
  { icon: "🪨", left: "3%", top: "88%" },
  { icon: "🌳", left: "96%", top: "82%" },
  { icon: "🌼", left: "50%", top: "6%" },
];

function CampusSprites({ agents, onSelectAgent }: { agents: Agent[]; onSelectAgent: (agent: Agent) => void }) {
  const idle = agents.filter((a) => a.status !== "working");
  const working = agents.filter((a) => a.status === "working");
  const idleSlots = layoutSlots(idle.map((a) => a.id), YARD_BAND);
  const deskSlots = layoutSlots(working.map((a) => a.id), DESK_BAND);

  return (
    <>
      {idle.map((agent) => {
        const { leftPct, topPct } = idleSlots.get(agent.id)!;
        return <AgentSprite key={agent.id} agent={agent} leftPct={leftPct} topPct={topPct} onClick={() => onSelectAgent(agent)} />;
      })}
      {working.map((agent) => {
        const { leftPct, topPct } = deskSlots.get(agent.id)!;
        return <AgentSprite key={agent.id} agent={agent} leftPct={leftPct} topPct={topPct} onClick={() => onSelectAgent(agent)} />;
      })}
    </>
  );
}

export function VillageScene({
  agents,
  onSelectAgent,
  onOpenOrchestrator,
}: {
  agents: Agent[];
  onSelectAgent: (agent: Agent) => void;
  onOpenOrchestrator: () => void;
}) {
  const researchers = agents.filter((a) => a.role_type === "researcher");
  const workers = agents.filter((a) => a.role_type !== "researcher");
  const { data: activity } = useActivity();
  const latest = activity?.[0];

  return (
    <div
      className="relative h-[560px] w-full overflow-hidden rounded-[10px] border border-border bg-[#1a2317]"
      style={{
        backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)",
        backgroundSize: "18px 18px",
      }}
    >
      {SCENERY.map((s, i) => (
        <span key={i} className="pointer-events-none absolute text-2xl opacity-70" style={{ left: s.left, top: s.top }}>
          {s.icon}
        </span>
      ))}

      <div className="absolute left-1/2 top-2 z-10 flex -translate-x-1/2 flex-col items-center">
        <Building icon="🏛" label="Town Hall" tone="accent" onClick={onOpenOrchestrator} />
        {latest && (
          <div className="mt-1 max-w-64 truncate rounded-md border border-accent/40 bg-panel px-2 py-1 text-[0.65rem] text-text-dim shadow-panel">
            {latest.label}
          </div>
        )}
      </div>

      <CampusZone tone="research" className="left-3 top-24 bottom-3 w-[calc(50%-24px)]">
        <Building icon="🔬" label="Research Lab" tone="research" className="absolute left-1/2 top-2 -translate-x-1/2" />
        <CampusSprites agents={researchers} onSelectAgent={onSelectAgent} />
      </CampusZone>

      <CampusZone tone="worker" className="right-3 top-24 bottom-3 w-[calc(50%-24px)]">
        <Building icon="🛠" label="Workshop" tone="worker" className="absolute left-1/2 top-2 -translate-x-1/2" />
        <CampusSprites agents={workers} onSelectAgent={onSelectAgent} />
      </CampusZone>

      {agents.length === 0 && (
        <p className="absolute inset-0 flex items-center justify-center text-text-dim">
          No one on floor yet. Recruit your first agent.
        </p>
      )}
    </div>
  );
}
