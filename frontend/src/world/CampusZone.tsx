import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export function CampusZone({
  label,
  tone,
  className,
  children,
}: {
  label: string;
  tone: "research" | "worker";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "absolute rounded-[10px] border",
        tone === "research" ? "border-research/40 bg-research/5" : "border-worker/40 bg-worker/5",
        className,
      )}
    >
      <span
        className={cn(
          "absolute left-3 top-2 text-xs font-semibold uppercase tracking-wider",
          tone === "research" ? "text-research" : "text-worker",
        )}
      >
        {label}
      </span>
      {children}
    </div>
  );
}
