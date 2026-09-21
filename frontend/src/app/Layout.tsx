import { Outlet } from "react-router-dom";
import { MissionControlButton } from "../features/opportunities/MissionControlButton";
import { Header } from "../features/workspace/Header";
import { StatusBanner } from "../features/workspace/StatusBanner";

export function Layout() {
  return (
    <div>
      <Header>
        <MissionControlButton />
      </Header>
      <StatusBanner />
      <main className="mx-auto max-w-6xl p-6">
        <Outlet />
      </main>
    </div>
  );
}
