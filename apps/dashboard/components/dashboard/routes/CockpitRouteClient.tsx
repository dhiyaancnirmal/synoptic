"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  createApiClient,
  getTradeSupportedChains,
  pingApi,
  type SupportedChainsResponse
} from "@/lib/api/client";
import { buildExplorerTxUrl } from "@/lib/api/explorer";
import { RouteShell } from "@/components/dashboard/RouteShell";
import { RequireSession } from "@/components/dashboard/RequireSession";
import { useDashboardRuntime } from "@/lib/state/use-dashboard-runtime";
import type { ActivityVM } from "@/lib/mappers";

function useQuickNodeStreamStatus(activity: ActivityVM[]) {
  return useMemo(() => {
    const quickNodeEvents = activity.filter((event) => event.eventType === "quicknode.block.received");
    const lastEvent = quickNodeEvents[0] || null;
    if (!lastEvent) {
      return {
        status: "offline" as const,
        timeSinceLastMs: Infinity,
        blocksProcessed: 0,
        transfersExtracted: 0,
        deploymentsDetected: 0
      };
    }
    const timeSinceLastMs = Date.now() - Date.parse(lastEvent.createdAt);
    const status =
      timeSinceLastMs < 30_000
        ? ("healthy" as const)
        : timeSinceLastMs < 120_000
          ? ("degraded" as const)
          : ("offline" as const);
    const parseMetric = (key: string): number => {
      const match = lastEvent.detail.match(new RegExp(`${key}:([0-9]+)`));
      if (!match) return 0;
      const parsed = Number(match[1]);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    return {
      status,
      timeSinceLastMs,
      blocksProcessed: parseMetric("blocksProcessed"),
      transfersExtracted: parseMetric("transfersExtracted"),
      deploymentsDetected: parseMetric("deploymentsDetected")
    };
  }, [activity]);
}

export function CockpitRouteClient() {
  const runtime = useDashboardRuntime();
  const api = useMemo(() => createApiClient(), []);
  const [apiHealth, setApiHealth] = useState("checking");
  const [supportedChains, setSupportedChains] = useState<SupportedChainsResponse>();
  const [purchaseCount, setPurchaseCount] = useState(0);
  const [topSku, setTopSku] = useState<string>("none");

  useEffect(() => {
    void pingApi().then(setApiHealth).catch(() => setApiHealth("unreachable"));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadOverview(): Promise<void> {
      try {
        const [chains, purchases] = await Promise.all([
          getTradeSupportedChains(runtime.token || undefined),
          api.listMarketplacePurchases(runtime.token || undefined)
        ]);
        if (cancelled) return;
        setSupportedChains(chains);
        setPurchaseCount(purchases.length);
        const counts = new Map<string, number>();
        for (const purchase of purchases) {
          counts.set(purchase.sku, (counts.get(purchase.sku) ?? 0) + 1);
        }
        const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
        setTopSku(top ? `${top[0]} (${top[1]})` : "none");
      } catch {
        // ignore partial load failures in cockpit
      }
    }
    void loadOverview();
    return () => {
      cancelled = true;
    };
  }, [api, runtime.token]);

  const streamHealth = useQuickNodeStreamStatus(runtime.activity);

  const failureQueue = useMemo(() => {
    const failedTrades = runtime.trades
      .filter((trade) => trade.status === "failed" || trade.status === "reverted")
      .map((trade) => ({
        id: trade.id,
        kind: "trade",
        createdAt: trade.createdAt,
        detail: `${trade.pair} (${trade.status})`,
        link: "/trading"
      }));

    const failedPayments = runtime.payments
      .filter((payment) => payment.status === "failed")
      .map((payment) => ({
        id: payment.id,
        kind: "payment",
        createdAt: payment.createdAt,
        detail: `${payment.serviceUrl} (${payment.status})`,
        link: "/payments"
      }));

    const failedActivity = runtime.activity
      .filter(
        (event) =>
          event.eventType.includes("failed") ||
          event.eventType.includes("revert") ||
          event.eventType.includes("error")
      )
      .map((event) => ({
        id: event.id,
        kind: "event",
        createdAt: event.createdAt,
        detail: `${event.eventType}: ${event.detail}`,
        link: "/activity"
      }));

    return [...failedTrades, ...failedPayments, ...failedActivity]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10);
  }, [runtime.activity, runtime.payments, runtime.trades]);

  return (
    <RequireSession>
      <RouteShell
        title="Overview"
        subtitle="action-driven operator cockpit"
        apiHealth={apiHealth}
        connectionStatus={runtime.connectionStatus}
      >
        {runtime.error ? <p className="dash-empty-inline">{runtime.error}</p> : null}

        <article className="dash-panel">
          <header className="dash-panel-head">
            <h3>Operator Strip</h3>
            <p className="pixel-text">trade+lp capability, marketplace throughput, streams lag</p>
          </header>
          <div className="dash-metric-strip">
            <div>
              <p className="pixel-text">Swap support</p>
              <strong>{supportedChains?.monadSupportedForSwap ? "Monad enabled" : "check /trade/supported-chains"}</strong>
            </div>
            <div>
              <p className="pixel-text">LP support</p>
              <strong>{supportedChains?.monadSupportedForLp ? "Monad enabled" : "Monad fallback required"}</strong>
            </div>
            <div>
              <p className="pixel-text">Marketplace purchases</p>
              <strong>{purchaseCount}</strong>
            </div>
            <div>
              <p className="pixel-text">Top SKU</p>
              <strong>{topSku}</strong>
            </div>
            <div>
              <p className="pixel-text">Streams health</p>
              <strong className={`dash-stream-${streamHealth.status}`}>{streamHealth.status}</strong>
            </div>
            <div>
              <p className="pixel-text">Failure queue</p>
              <strong>{failureQueue.length}</strong>
            </div>
          </div>
        </article>

        <div className="dash-two-pane">
          <article className="dash-panel">
            <header className="dash-panel-head">
              <h3>Streams Health</h3>
              <p className="pixel-text">lag + extraction rates from latest webhook event</p>
            </header>
            <div className="dash-table">
              <div className="dash-table-head dash-table-head-4">
                <span>metric</span>
                <span>value</span>
                <span>metric</span>
                <span>value</span>
              </div>
              <div className="dash-table-row dash-table-row-4">
                <span>blocksProcessed</span>
                <span>{streamHealth.blocksProcessed}</span>
                <span>transfersExtracted</span>
                <span>{streamHealth.transfersExtracted}</span>
              </div>
              <div className="dash-table-row dash-table-row-4">
                <span>deploymentsDetected</span>
                <span>{streamHealth.deploymentsDetected}</span>
                <span>timeSinceLastMs</span>
                <span>{Number.isFinite(streamHealth.timeSinceLastMs) ? streamHealth.timeSinceLastMs : "n/a"}</span>
              </div>
            </div>

            <div className="dash-table">
              <div className="dash-table-head dash-table-head-6">
                <span>time</span>
                <span>pair</span>
                <span>routing</span>
                <span>intent</span>
                <span>status</span>
                <span>tx</span>
              </div>
              {runtime.trades.slice(0, 6).map((trade) => (
                <div className="dash-table-row dash-table-row-6" key={trade.id}>
                  <span>{trade.createdAt}</span>
                  <span>{trade.pair}</span>
                  <span>{trade.routingType}</span>
                  <span>{trade.intent ?? "swap"}</span>
                  <span>{trade.status}</span>
                  <span>
                    {trade.executionTxHash
                      ? (() => {
                          const url = buildExplorerTxUrl({
                            chain: trade.executionChain,
                            txHash: trade.executionTxHash
                          });
                          return url ? (
                            <a href={url} target="_blank" rel="noreferrer">
                              open
                            </a>
                          ) : (
                            "unconfigured"
                          );
                        })()
                      : "N/A"}
                  </span>
                </div>
              ))}
            </div>
          </article>

          <article className="dash-panel">
            <header className="dash-panel-head">
              <h3>Operator Action Queue</h3>
              <p className="pixel-text">items requiring intervention</p>
            </header>
            {failureQueue.length > 0 ? (
              <div className="dash-feed-list">
                {failureQueue.map((item) => (
                  <div key={`${item.kind}-${item.id}`} className="dash-feed-row error">
                    <p className="pixel-text">{item.createdAt}</p>
                    <p className="dash-feed-title">{item.kind}</p>
                    <p>{item.detail}</p>
                    <Link href={item.link} className="pixel-text">
                      open
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <p className="dash-empty-inline">No recent failures requiring action.</p>
            )}

            <div className="dash-table">
              <div className="dash-table-head dash-table-head-3">
                <span>route</span>
                <span>purpose</span>
                <span>action</span>
              </div>
              <div className="dash-table-row dash-table-row-3">
                <span>/trading</span>
                <span>Swap/order and LP execution controls</span>
                <span>
                  <Link href="/trading">open</Link>
                </span>
              </div>
              <div className="dash-table-row dash-table-row-3">
                <span>/marketplace</span>
                <span>Derived data product purchase + previews</span>
                <span>
                  <Link href="/marketplace">open</Link>
                </span>
              </div>
              <div className="dash-table-row dash-table-row-3">
                <span>/streams</span>
                <span>Ingestion telemetry and extraction state</span>
                <span>
                  <Link href="/streams">open</Link>
                </span>
              </div>
            </div>
          </article>
        </div>
      </RouteShell>
    </RequireSession>
  );
}
