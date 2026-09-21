import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

const badge = cva("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", {
  variants: {
    tone: {
      neutral: "bg-panel-2 text-text-dim",
      ok: "text-ok bg-ok/10",
      warn: "text-warn bg-warn/10",
      err: "text-err bg-err/10",
      accent: "text-accent bg-accent/10",
    },
  },
  defaultVariants: { tone: "neutral" },
});

type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}
