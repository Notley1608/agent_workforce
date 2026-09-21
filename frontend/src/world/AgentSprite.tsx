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
      className="group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
      style={{ left: `${leftPct}%`, top: `${topPct}%` }}
      transition={{ type: "spring", stiffness: 120, damping: 16 }}
    >
      <motion.span
        animate={{ y: [0, -3, 0] }}
        transition={{ duration: working ? 1.2 : 2.6, repeat: Infinity, ease: "easeInOut" }}
        whileHover={{ scale: 1.1 }}
        className={cn(
          "relative flex h-10 w-10 items-center justify-center rounded-full border-2 bg-panel-2 text-lg shadow-panel transition-colors group-hover:border-accent",
          working ? "border-warn" : "border-border",
        )}
      >
        {agent.avatar}
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-panel",
            working ? "bg-warn animate-pulse" : "bg-ok",
          )}
        />
      </motion.span>
      <span className="mt-0.5 h-1.5 w-5 rounded-full bg-black/40 blur-[1px]" />
      <span className="mt-1 max-w-20 truncate text-[0.65rem] font-medium text-text">{agent.name}</span>
      {working && agent.current_job_input && (
        <span className="max-w-24 truncate rounded-full border border-border bg-panel px-1.5 py-0.5 text-[0.6rem] text-text-dim">
          {agent.current_job_input}
        </span>
      )}
    </motion.button>
  );
}
