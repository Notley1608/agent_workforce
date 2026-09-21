import { Outlet } from "react-router-dom";
import { MissionControlButton } from "../features/opportunities/MissionControlButton";
import { MissionsButton } from "../features/missions/MissionsButton";
import { PipelinesButton } from "../features/pipelines/PipelinesButton";
import { ActivityFeedButton } from "../features/workspace/ActivityFeedButton";
import { Header } from "../features/workspace/Header";
import { StatusBanner } from "../features/workspace/StatusBanner";

export function Layout() {
  return (
    <div>
      <Header>
        <MissionsButton />
        <PipelinesButton />
        <MissionControlButton />
        <ActivityFeedButton />
      </Header>
      <StatusBanner />
      <main className="mx-auto max-w-6xl p-6">
        <Outlet />
      </main>
    </div>
  );
}
