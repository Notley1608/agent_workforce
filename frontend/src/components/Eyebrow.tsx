import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export function Eyebrow({ children, muted = true, className }: { children: ReactNode; muted?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "text-xs font-semibold uppercase tracking-wider",
        muted ? "text-text-dim" : "text-accent",
        className,
      )}
    >
      {children}
    </span>
  );
}
