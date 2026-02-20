"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { pingApi } from "@/lib/api/client";
import { buildExplorerTxUrl } from "@/lib/api/explorer";
import { RouteShell } from "@/components/dashboard/RouteShell";
import { RequireSession } from "@/components/dashboard/RequireSession";
import { useDashboardRuntime } from "@/lib/state/use-dashboard-runtime";
import type { ActivityVM } from "@/lib/mappers";

function useQuickNodeStreamStatus(activity: ActivityVM[]) {
  return useMemo(() => {
    const quickNodeEvents = activity.filter(
      (event) => event.eventType === "quicknode.block.received"
    );
    const lastEvent = quickNodeEvents[0] || null;
    if (!lastEvent) return { status: "offline" as const, timeSinceLastMs: Infinity };
    const timeSinceLastMs = Date.now() - Date.parse(lastEvent.createdAt);
    const status =
      timeSinceLastMs < 30_000
        ? ("healthy" as const)
        : timeSinceLastMs < 120_000
          ? ("degraded" as const)
          : ("offline" as const);
    return { status, timeSinceLastMs };
  }, [activity]);
}

export function CockpitRouteClient() {
  const runtime = useDashboardRuntime();
  const [apiHealth, setApiHealth] = useState("checking");

  useEffect(() => {
    void pingApi()
      .then(setApiHealth)
      .catch(() => setApiHealth("unreachable"));
  }, []);

  const activeAgents = runtime.agents.filter((a) => a.status === "running").length;
  const idleAgents = runtime.agents.length - activeAgents;

  const settledPayments = runtime.payments.filter((p) => p.status === "settled");
  const totalSettledUsd = settledPayments.reduce(
    (sum, p) => sum + parseFloat(p.amountUsd || "0"),
    0
  );

  const confirmedTrades = runtime.trades.filter((t) => t.status === "confirmed");
  const confirmationRate =
    runtime.trades.length > 0
      ? Math.round((confirmedTrades.length / runtime.trades.length) * 100)
      : 0;

  const streamHealth = useQuickNodeStreamStatus(runtime.activity);

  const totalBudget = runtime.agents.reduce(
    (sum, a) => sum + parseFloat(a.dailyBudgetUsd || "0"),
    0
  );
  const totalSpent = runtime.agents.reduce(
    (sum, a) => sum + parseFloat(a.spentTodayUsd || "0"),
    0
  );
  const budgetUtilization = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

  const latestActivity = runtime.activity[0];
  const latestTimestamp = latestActivity?.createdAt ?? "N/A";

  const recentTrades = runtime.trades.slice(0, 5);
  const recentPayments = runtime.payments.slice(0, 5);

  return (
    <RequireSession>
      <RouteShell
        title="Overview"
        subtitle="system health at a glance"
        apiHealth={apiHealth}
        connectionStatus={runtime.connectionStatus}
      >
        {runtime.error ? <p className="dash-empty-inline">{runtime.error}</p> : null}

        <section className="dash-route-stack">
          <div className="dash-kpi-row-6">
            <div className="dash-kpi-card">
              <p className="pixel-text">Agents</p>
              <h3>{runtime.agents.length}</h3>
              <p>
                {activeAgents} active, {idleAgents} idle
              </p>
            </div>
            <div className="dash-kpi-card">
              <p className="pixel-text">Settled Payments</p>
              <h3>${totalSettledUsd.toFixed(2)}</h3>
              <p>{settledPayments.length} settled</p>
            </div>
            <div className="dash-kpi-card">
              <p className="pixel-text">Trades</p>
              <h3>{runtime.trades.length}</h3>
              <p>{confirmationRate}% confirmed</p>
            </div>
            <div className="dash-kpi-card">
              <p className="pixel-text">Stream Health</p>
              <h3 className={`dash-stream-${streamHealth.status}`}>{streamHealth.status}</h3>
              <p>QuickNode</p>
            </div>
            <div className="dash-kpi-card">
              <p className="pixel-text">Budget Used</p>
              <h3>{budgetUtilization}%</h3>
              <p>
                ${totalSpent.toFixed(2)} / ${totalBudget.toFixed(2)}
              </p>
            </div>
            <div className="dash-kpi-card">
              <p className="pixel-text">Latest Activity</p>
              <h3 style={{ fontSize: "0.92rem" }}>{latestTimestamp}</h3>
              <p>{latestActivity?.eventType ?? "none"}</p>
            </div>
          </div>

          <div className="dash-overview-grid">
            <article className="dash-panel">
              <header className="dash-panel-head">
                <h3>Recent Trades</h3>
                <Link href="/trading" className="pixel-text">
                  view all
                </Link>
              </header>

              {recentTrades.length > 0 ? (
                <div className="dash-feed-list">
                  {recentTrades.map((trade) => (
                    <div key={trade.id} className="dash-feed-row">
                      <p className="pixel-text">{trade.createdAt}</p>
                      <p className="dash-feed-title">{trade.pair}</p>
                      <p>
                        {trade.amountIn} / {trade.amountOut} —{" "}
                        <span
                          className={`dash-status ${
                            trade.status === "failed" || trade.status === "reverted"
                              ? "error"
                              : trade.status === "confirmed"
                                ? "success"
                                : "challenge"
                          }`}
                        >
                          {trade.status}
                        </span>
                        {trade.executionTxHash
                          ? (() => {
                              const url = buildExplorerTxUrl({
                                chain: trade.executionChain,
                                txHash: trade.executionTxHash,
                              });
                              return url ? (
                                <>
                                  {" "}
                                  <a href={url} target="_blank" rel="noreferrer">
                                    tx
                                  </a>
                                </>
                              ) : null;
                            })()
                          : null}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="dash-empty-inline">No trades yet.</p>
              )}
            </article>

            <article className="dash-panel">
              <header className="dash-panel-head">
                <h3>Recent Payments</h3>
                <Link href="/payments" className="pixel-text">
                  view all
                </Link>
              </header>

              {recentPayments.length > 0 ? (
                <div className="dash-feed-list">
                  {recentPayments.map((payment) => (
                    <div key={payment.id} className="dash-feed-row">
                      <p className="pixel-text">{payment.createdAt}</p>
                      <p className="dash-feed-title">${payment.amountUsd}</p>
                      <p>
                        {payment.serviceUrl} —{" "}
                        <span
                          className={`dash-status ${
                            payment.status === "failed"
                              ? "error"
                              : payment.status === "settled"
                                ? "success"
                                : "challenge"
                          }`}
                        >
                          {payment.status}
                        </span>
                        {payment.txHash
                          ? (() => {
                              const url = buildExplorerTxUrl({
                                chain: "kite-testnet",
                                txHash: payment.txHash,
                              });
                              return url ? (
                                <>
                                  {" "}
                                  <a href={url} target="_blank" rel="noreferrer">
                                    tx
                                  </a>
                                </>
                              ) : null;
                            })()
                          : null}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="dash-empty-inline">No payments yet.</p>
              )}
            </article>
          </div>
        </section>
      </RouteShell>
    </RequireSession>
  );
}
