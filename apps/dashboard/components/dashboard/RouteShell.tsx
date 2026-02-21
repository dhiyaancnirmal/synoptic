"use client";

import type { ReactNode } from "react";
import { RouteSidebarNav } from "./RouteSidebarNav";

interface RouteShellProps {
  children: ReactNode;
  apiHealth: string;
  connectionStatus: string;
  title: string;
  subtitle: string;
}

export function RouteShell({ apiHealth, connectionStatus }: RouteShellProps) {
  return (
    <div className="dash-shell">
      <RouteSidebarNav apiHealth={apiHealth} connectionStatus={connectionStatus} />
      <main className="dash-main" />
    </div>
  );
}
