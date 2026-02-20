"use client";

import { useEffect, useState } from "react";
import { pingApi } from "@/lib/api/client";
import { buildExplorerAddressUrl } from "@/lib/api/explorer";
import { RouteShell } from "@/components/dashboard/RouteShell";
import { RequireSession } from "@/components/dashboard/RequireSession";
import { useDashboardRuntime } from "@/lib/state/use-dashboard-runtime";

export function AgentsRouteClient() {
  const runtime = useDashboardRuntime();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [apiHealth, setApiHealth] = useState("checking");

  useEffect(() => {
    void pingApi().then(setApiHealth).catch(() => setApiHealth("unreachable"));
  }, []);

  const focused = runtime.agents.find((agent) => agent.id === selectedAgent) ?? runtime.agents[0] ?? null;
  const isBudgetExhausted =
    focused && Number(focused.dailyBudgetUsd) > 0
      ? Number(focused.spentTodayUsd) >= Number(focused.dailyBudgetUsd)
      : false;

  return (
    <RequireSession>
      <RouteShell
        title="Agents"
        subtitle="identity, lifecycle, and manual controls"
        apiHealth={apiHealth}
        connectionStatus={runtime.connectionStatus}
      >
        {runtime.error ? <p className="dash-empty-inline">{runtime.error}</p> : null}
        <article className="dash-panel">
          <header className="dash-panel-head">
            <h3>Registry</h3>
            <p className="pixel-text">select an agent and run controls</p>
          </header>
          {runtime.loading ? <p className="dash-empty-inline">Loading agents...</p> : null}
          <div className="dash-agent-table">
            {runtime.agents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                className={`dash-agent-row ${focused?.id === agent.id ? "active" : ""}`}
                onClick={() => setSelectedAgent(agent.id)}
              >
                <div>
                  <p className="dash-agent-id">{agent.name}</p>
                  <p className="dash-agent-owner">{agent.eoaAddress || agent.ownerAddress}</p>
                </div>
                <div className={`dash-agent-status ${agent.status}`}>{agent.status}</div>
              </button>
            ))}
          </div>

          {focused ? (
            <div className="dash-agent-detail">
              <h4>{focused.name}</h4>
              <p className="pixel-text">role {focused.role}</p>
              <p className="dash-detail-line">
                passport owner:{" "}
                {focused.ownerAddress
                  ? (() => {
                      const ownerUrl = buildExplorerAddressUrl({
                        chain: "kite-testnet",
                        address: focused.ownerAddress
                      });
                      return ownerUrl ? (
                        <a href={ownerUrl} target="_blank" rel="noreferrer">
                          {focused.ownerAddress}
                        </a>
                      ) : (
                        focused.ownerAddress
                      );
                    })()
                  : "unknown"}
              </p>
              <p className="dash-detail-line">executor eoa: {focused.eoaAddress || "unknown"}</p>
              <p className="dash-detail-line">budget ${focused.spentTodayUsd} / ${focused.dailyBudgetUsd}</p>
              {isBudgetExhausted ? (
                <p className="dash-empty-inline">
                  Budget exhausted. This agent should remain paused until budget window reset.
                </p>
              ) : null}
              <div className="dash-filter-row">
                <button className="dash-filter" onClick={() => void runtime.startAgent(focused.id)} type="button">
                  start
                </button>
                <button className="dash-filter" onClick={() => void runtime.stopAgent(focused.id)} type="button">
                  stop
                </button>
                <button className="dash-filter active" onClick={() => void runtime.triggerAgent(focused.id)} type="button">
                  trigger
                </button>
              </div>
            </div>
          ) : null}
        </article>
      </RouteShell>
    </RequireSession>
  );
}
