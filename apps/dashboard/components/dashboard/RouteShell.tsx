"use client";

import type { ReactNode } from "react";
import { RouteSidebarNav } from "./RouteSidebarNav";

interface RouteShellProps {
  children: ReactNode;
  apiHealth?: string;
  connectionStatus?: string;
  title: string;
  subtitle: string;
}

export function RouteShell({ children, apiHealth, connectionStatus, title, subtitle }: RouteShellProps) {
  return (
    <div className="dash-shell">
      <RouteSidebarNav
        apiHealth={apiHealth ?? "unknown"}
        connectionStatus={connectionStatus ?? "unknown"}
      />
      <main className="dash-main">
        <header className="dash-route-header">
          <div>
            <h1>{title}</h1>
            <p className="pixel-text">{subtitle}</p>
          </div>
          <div className="dash-route-topbar">
            <span className="dash-route-chip">API {apiHealth ?? "unknown"}</span>
            <span className={`dash-route-chip ${connectionStatus === "connected" ? "ok" : "warn"}`}>
              WS {connectionStatus ?? "unknown"}
            </span>
          </div>
        </header>
        <section className="dash-route-stack">{children}</section>
      </main>
    </div>
  );
}
