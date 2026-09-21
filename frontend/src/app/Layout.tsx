import { Outlet } from "react-router-dom";
import { Header } from "../features/workspace/Header";

export function Layout() {
  return (
    <div>
      <Header />
      <main className="mx-auto max-w-6xl p-6">
        <Outlet />
      </main>
    </div>
  );
}
