import type { ReactNode } from "react";
import { InfrastructureToggles } from "./InfrastructureToggles";
import { SettingsControls } from "./SettingsControls";
import { UsageBadge } from "./UsageBadge";

export function Header({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-panel px-6 py-4">
      <h1 className="mr-auto text-xl font-semibold">Crew</h1>
      <InfrastructureToggles />
      <UsageBadge />
      <SettingsControls />
      {children}
    </header>
  );
}
