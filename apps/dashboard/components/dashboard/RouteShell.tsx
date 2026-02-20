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

export function RouteShell({ children, apiHealth, connectionStatus, title, subtitle }: RouteShellProps) {
  return (
    <div className="dash-shell">
      <RouteSidebarNav apiHealth={apiHealth} connectionStatus={connectionStatus} />
      <main className="dash-main">
        <article className="dash-panel">
          <header className="dash-panel-head">
            <h3>{title}</h3>
            <p className="pixel-text">{subtitle}</p>
          </header>
        </article>
        <section className="dash-route-stack">{children}</section>
      </main>
    </div>
  );
}
