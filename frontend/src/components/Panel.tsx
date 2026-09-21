import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[10px] border border-border bg-panel shadow-panel",
        className,
      )}
      {...props}
    />
  );
}
