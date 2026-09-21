import type { ReactNode } from "react";
import { cn } from "../lib/cn";

const ROOF_TONE = {
  research: "border-b-research",
  worker: "border-b-worker",
  accent: "border-b-accent",
};

export function Building({
  icon,
  label,
  tone,
  className,
  onClick,
  children,
}: {
  icon: string;
  label: string;
  tone: "research" | "worker" | "accent";
  className?: string;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex flex-col items-center",
        onClick ? "cursor-pointer transition hover:brightness-110" : "pointer-events-none",
        className,
      )}
    >
      <div className="relative">
        <div className={cn("h-0 w-0 border-x-[28px] border-x-transparent border-b-[22px]", ROOF_TONE[tone])} />
        <div className="flex h-11 w-[56px] items-center justify-center rounded-b-[4px] border border-t-0 border-border bg-panel-2 text-xl shadow-panel">
          {icon}
        </div>
      </div>
      <span className="mt-1 text-[0.65rem] font-semibold uppercase tracking-wider text-text-dim">{label}</span>
      {children}
    </Tag>
  );
}
