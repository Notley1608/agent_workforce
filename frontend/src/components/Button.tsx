import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../lib/cn";

const button = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary: "bg-accent text-white hover:brightness-110",
        secondary: "bg-panel-2 border border-border text-text hover:border-accent/60",
        danger: "bg-err text-white hover:brightness-110",
      },
    },
    defaultVariants: { variant: "primary" },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>;

export function Button({ className, variant, ...props }: ButtonProps) {
  return <button className={cn(button({ variant }), className)} {...props} />;
}
