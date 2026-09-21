import * as RadixDialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { fadeScale, overlayFade } from "../lib/motion";
import { cn } from "../lib/cn";

export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  trigger,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  trigger?: ReactNode;
  className?: string;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>}
      <AnimatePresence>
        {open && (
          <RadixDialog.Portal forceMount>
            <RadixDialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-40 bg-black/60"
                variants={overlayFade}
                initial="hidden"
                animate="visible"
                exit="exit"
              />
            </RadixDialog.Overlay>
            <RadixDialog.Content asChild aria-describedby={undefined}>
              <motion.div
                className={cn(
                  "fixed top-1/2 left-1/2 z-50 max-h-[85vh] w-[min(480px,90vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[10px] border border-border bg-panel p-6 shadow-panel",
                  className,
                )}
                variants={fadeScale}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <RadixDialog.Title className="mb-4 text-lg font-semibold text-text">{title}</RadixDialog.Title>
                {children}
              </motion.div>
            </RadixDialog.Content>
          </RadixDialog.Portal>
        )}
      </AnimatePresence>
    </RadixDialog.Root>
  );
}
