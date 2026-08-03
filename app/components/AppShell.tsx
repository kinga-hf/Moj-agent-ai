"use client";

import type { ReactNode } from "react";
import { DashboardSidebar } from "./DashboardSidebar";
import { GlobalSidebarContext } from "./SidebarContext";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <GlobalSidebarContext.Provider value>
      <div className="app-shell">
        <DashboardSidebar global />
        <div className="app-shell-content">{children}</div>
      </div>
    </GlobalSidebarContext.Provider>
  );
}
