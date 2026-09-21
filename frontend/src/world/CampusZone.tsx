import type { ReactNode } from "react";
import { cn } from "../lib/cn";

const TONE_BG = {
  research: "radial-gradient(circle at 1px 1px, rgba(79,195,217,0.16) 1px, transparent 0)",
  worker: "radial-gradient(circle at 1px 1px, rgba(224,164,88,0.16) 1px, transparent 0)",
};

export function CampusZone({
  tone,
  className,
  children,
}: {
  tone: "research" | "worker";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("absolute rounded-[24px]", tone === "research" ? "bg-research/[0.04]" : "bg-worker/[0.04]", className)}
      style={{ backgroundImage: TONE_BG[tone], backgroundSize: "16px 16px" }}
    >
      {children}
    </div>
  );
}
