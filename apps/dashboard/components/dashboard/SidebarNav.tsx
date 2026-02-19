"use client";

import type { DashboardTab } from "./types";

interface SidebarNavProps {
  activeTab: DashboardTab;
  onChange: (tab: DashboardTab) => void;
  apiHealth: string;
}

const tabs: Array<{ id: DashboardTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "agents", label: "Agents" },
  { id: "payments", label: "Payments" },
  { id: "trading", label: "Trading" },
  { id: "commerce", label: "Commerce" },
  { id: "failures", label: "Failures" }
];

export function SidebarNav({ activeTab, onChange, apiHealth }: SidebarNavProps) {
  return (
    <aside className="dash-sidebar">
      <div>
        <div className="logo-font dash-logo-s">S</div>
        <p className="pixel-text dash-sidebar-label">Synoptic</p>
      </div>

      <nav className="dash-tab-list">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`dash-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="dash-sidebar-foot">
        <p className="pixel-text">Kite Testnet 2368</p>
        <p className={`dash-health ${apiHealth === "ok" ? "ok" : "warn"}`}>API {apiHealth}</p>
      </div>
    </aside>
  );
}
