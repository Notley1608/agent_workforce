import { motion } from "motion/react";
import { cn } from "../lib/cn";
import type { Agent } from "../lib/schemas/agent";

export function AgentSprite({
  agent,
  leftPct,
  topPct,
  onClick,
}: {
  agent: Agent;
  leftPct: number;
  topPct: number;
  onClick: () => void;
}) {
  const working = agent.status === "working";

  return (
    <motion.button
      type="button"
      layout
      onClick={onClick}
      className="group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
      style={{ left: `${leftPct}%`, top: `${topPct}%` }}
      whileHover={{ scale: 1.08 }}
    >
      <span
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-full border bg-panel-2 text-lg shadow-panel transition group-hover:border-accent",
          working ? "border-warn" : "border-border",
        )}
      >
        {agent.avatar}
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-panel",
            working ? "bg-warn animate-pulse" : agent.status === "idle" ? "bg-ok" : "bg-text-dim",
          )}
        />
      </span>
      <span className="max-w-20 truncate text-[0.65rem] font-medium text-text">{agent.name}</span>
      {working && agent.current_job_input && (
        <span className="max-w-24 truncate text-[0.6rem] text-text-dim">{agent.current_job_input}</span>
      )}
    </motion.button>
  );
}
