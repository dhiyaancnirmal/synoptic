"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { pingApi } from "@/lib/api/client";
import { buildExplorerTxUrl } from "@/lib/api/explorer";
import { RequireSession } from "@/components/dashboard/RequireSession";
import { RouteShell } from "@/components/dashboard/RouteShell";
import { useDashboardRuntime } from "@/lib/state/use-dashboard-runtime";

export function ActivityRouteClient() {
  const runtime = useDashboardRuntime();
  const searchParams = useSearchParams();
  const availableChains = useMemo(
    () => Array.from(new Set(runtime.activity.map((entry) => entry.chain))).sort(),
    [runtime.activity]
  );
  const [filter, setFilter] = useState<string>("all");
  const [apiHealth, setApiHealth] = useState("checking");
  useEffect(() => {
    void pingApi().then(setApiHealth).catch(() => setApiHealth("unreachable"));
  }, []);

  const selectedPaymentId = searchParams.get("paymentId");
  const selectedTradeId = searchParams.get("tradeId");

  const filtered =
    filter === "all" ? runtime.activity : runtime.activity.filter((entry) => entry.chain === filter);
  const sorted = [...filtered].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return (
    <RequireSession>
      <RouteShell
        title="Activity"
        subtitle="cross-chain timeline"
        apiHealth={apiHealth}
        connectionStatus={runtime.connectionStatus}
      >
        <article className="dash-panel">
          <header className="dash-panel-head">
            <h3>Timeline</h3>
            <p className="pixel-text">all agents, all event domains</p>
          </header>
          <div className="dash-filter-row">
            <button type="button" className={`dash-filter ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>all</button>
            {availableChains.map((chain) => (
              <button
                key={chain}
                type="button"
                className={`dash-filter ${filter === chain ? "active" : ""}`}
                onClick={() => setFilter(chain)}
              >
                {chain}
              </button>
            ))}
          </div>
          <div className="dash-feed-list">
            {sorted.map((event) => (
              <div
                key={event.id}
                className={`dash-feed-row ${
                  event.eventType.includes("failed") || event.eventType.includes("error") || event.eventType.includes("revert")
                    ? "error"
                    : ""
                } ${
                  (selectedPaymentId && event.paymentId === selectedPaymentId) ||
                  (selectedTradeId && event.tradeId === selectedTradeId)
                    ? "active"
                    : ""
                }`}
              >
                <p className="pixel-text">{event.createdAt}</p>
                <p className="dash-feed-title">{event.eventType}</p>
                <p>{event.detail}</p>
                <p className="pixel-text">
                  {event.agentId} · {event.chain}{" "}
                  {event.txHash
                    ? (() => {
                        const txUrl = buildExplorerTxUrl({ chain: event.chain, txHash: event.txHash });
                        if (!txUrl) return `· tx ${event.txHash}`;
                        return (
                          <>
                            ·{" "}
                            <a href={txUrl} target="_blank" rel="noreferrer">
                              tx
                            </a>
                          </>
                        );
                      })()
                    : ""}
                </p>
                <p className="pixel-text">
                  {event.paymentId ? (
                    <Link href={`/payments?paymentId=${encodeURIComponent(event.paymentId)}`}>payment</Link>
                  ) : null}{" "}
                  {event.tradeId ? (
                    <Link href={`/trading?tradeId=${encodeURIComponent(event.tradeId)}`}>trade</Link>
                  ) : null}
                </p>
              </div>
            ))}
            {sorted.length === 0 ? <p className="dash-empty-inline">No activity for selected filter.</p> : null}
          </div>
        </article>
      </RouteShell>
    </RequireSession>
  );
}
