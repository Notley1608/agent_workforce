import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

export type Status = "ok" | "warn" | "err" | "idle";

const dot = cva("inline-block h-2 w-2 rounded-full", {
  variants: {
    status: {
      ok: "bg-ok",
      warn: "bg-warn animate-pulse",
      err: "bg-err",
      idle: "bg-text-dim",
    },
  },
  defaultVariants: { status: "idle" },
});

export function StatusIndicator({
  status,
  label,
  className,
}: { status: Status; label?: string; className?: string } & VariantProps<typeof dot>) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
      <span className={dot({ status })} />
      {label}
    </span>
  );
}
