"use client";

import { useEffect, useMemo, useState } from "react";
import { pingApi } from "@/lib/api/client";
import { buildExplorerTxUrl, buildExplorerAddressUrl } from "@/lib/api/explorer";
import { RouteShell } from "@/components/dashboard/RouteShell";
import { RequireSession } from "@/components/dashboard/RequireSession";
import { useDashboardRuntime } from "@/lib/state/use-dashboard-runtime";
import type { ActivityVM, AgentVM, PaymentVM, TradeVM } from "@/lib/mappers";

type CockpitTab = "session" | "spot" | "payments" | "stream";

interface LivelinePoint {
  time: number;
  blockNumber: number;
}

function LivelineGraph({ data }: { data: LivelinePoint[] }) {
  if (data.length < 2) return null;

  const width = 800;
  const height = 200;
  const padding = 40;

  const times = data.map((d) => d.time);
  const blocks = data.map((d) => d.blockNumber);

  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const minBlock = Math.min(...blocks);
  const maxBlock = Math.max(...blocks);

  const timeRange = Math.max(maxTime - minTime, 1);
  const blockRange = Math.max(maxBlock - minBlock, 1);

  const scaleX = (time: number) => padding + ((time - minTime) / timeRange) * (width - 2 * padding);
  const scaleY = (block: number) =>
    height - padding - ((block - minBlock) / blockRange) * (height - 2 * padding);

  const pathD = data
    .map((point, i) => {
      const x = scaleX(point.time);
      const y = scaleY(point.blockNumber);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");

  const areaD = `${pathD} L ${scaleX(data[data.length - 1].time)} ${height - padding} L ${padding} ${height - padding} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="dash-liveline-svg">
      <defs>
        <linearGradient id="liveline-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--spicy-paprika)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--spicy-paprika)" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#liveline-gradient)" />
      <path d={pathD} fill="none" stroke="var(--spicy-paprika)" strokeWidth="2" />
      {data.slice(-5).map((point, i) => (
        <g key={i}>
          <circle
            cx={scaleX(point.time)}
            cy={scaleY(point.blockNumber)}
            r="3"
            fill="var(--floral-white)"
          />
        </g>
      ))}
      <text x={padding} y={20} className="dash-liveline-label" fill="var(--dust-grey)">
        Block #{minBlock.toLocaleString()} - #{maxBlock.toLocaleString()}
      </text>
    </svg>
  );
}

interface TokenExposure {
  symbol: string;
  amount: number;
  change: number;
}

function useDerivedExposure(trades: TradeVM[]): TokenExposure[] {
  return useMemo(() => {
    const holdings = new Map<string, { amount: number; change: number }>();

    for (const trade of trades) {
      if (trade.executionChain !== "monad-testnet" && trade.executionChain !== "monad") continue;
      if (trade.status !== "confirmed") continue;

      const [tokenIn, tokenOut] = trade.pair.split(" -> ").map((s) => s.trim());
      const amountIn = parseFloat(trade.amountIn) || 0;
      const amountOut = parseFloat(trade.amountOut) || 0;

      if (tokenIn && !isNaN(amountIn)) {
        const current = holdings.get(tokenIn) || { amount: 0, change: 0 };
        holdings.set(tokenIn, {
          amount: current.amount - amountIn,
          change: current.change - amountIn
        });
      }

      if (tokenOut && !isNaN(amountOut)) {
        const current = holdings.get(tokenOut) || { amount: 0, change: 0 };
        holdings.set(tokenOut, {
          amount: current.amount + amountOut,
          change: current.change + amountOut
        });
      }
    }

    return Array.from(holdings.entries())
      .filter(([, data]) => data.amount !== 0)
      .map(([symbol, data]) => ({
        symbol,
        amount: data.amount,
        change: data.change
      }))
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  }, [trades]);
}

function useQuickNodeStreamStatus(activity: ActivityVM[]): {
  status: "healthy" | "degraded" | "offline";
  lastEvent: ActivityVM | null;
  eventCount: number;
  timeSinceLastMs: number;
} {
  return useMemo(() => {
    const quickNodeEvents = activity.filter(
      (event) => event.eventType === "quicknode.block.received"
    );

    const lastEvent = quickNodeEvents[0] || null;

    if (!lastEvent) {
      return {
        status: "offline",
        lastEvent: null,
        eventCount: quickNodeEvents.length,
        timeSinceLastMs: Infinity
      };
    }

    const lastEventTime = Date.parse(lastEvent.createdAt);
    const timeSinceLastMs = Date.now() - lastEventTime;

    let status: "healthy" | "degraded" | "offline";
    if (timeSinceLastMs < 30_000) {
      status = "healthy";
    } else if (timeSinceLastMs < 120_000) {
      status = "degraded";
    } else {
      status = "offline";
    }

    return {
      status,
      lastEvent,
      eventCount: quickNodeEvents.length,
      timeSinceLastMs
    };
  }, [activity]);
}

function useLivelineData(activity: ActivityVM[]): Array<{ time: number; blockNumber: number }> {
  return useMemo(() => {
    const quickNodeEvents = activity
      .filter((event) => event.eventType === "quicknode.block.received")
      .slice(0, 50)
      .reverse();

    return quickNodeEvents.map((event) => {
      const blockNumber = event.detail.match(/blockNumber:(\d+)/)?.[1];
      return {
        time: Date.parse(event.createdAt),
        blockNumber: blockNumber ? parseInt(blockNumber, 10) : 0
      };
    });
  }, [activity]);
}

function SessionTab({
  agents,
  onStart,
  onStop,
  onTrigger
}: {
  agents: AgentVM[];
  onStart: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onTrigger: (id: string) => Promise<void>;
}) {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const focused = agents.find((a) => a.id === selectedAgentId) ?? agents[0] ?? null;

  const budgetPercent =
    focused && Number(focused.dailyBudgetUsd) > 0
      ? Math.min(100, (Number(focused.spentTodayUsd) / Number(focused.dailyBudgetUsd)) * 100)
      : 0;

  const isBudgetExhausted =
    focused && Number(focused.dailyBudgetUsd) > 0
      ? Number(focused.spentTodayUsd) >= Number(focused.dailyBudgetUsd)
      : false;

  return (
    <article className="dash-panel">
      <header className="dash-panel-head">
        <h3>Agent Session</h3>
        <p className="pixel-text">identity, lifecycle, and budget state</p>
      </header>

      <div className="dash-agent-table">
        {agents.map((agent) => (
          <button
            key={agent.id}
            type="button"
            className={`dash-agent-row ${focused?.id === agent.id ? "active" : ""}`}
            onClick={() => setSelectedAgentId(agent.id)}
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

          <div className="dash-detail-block">
            <p className="dash-detail-label">Passport Owner</p>
            <p className="dash-detail-line">
              {focused.ownerAddress
                ? (() => {
                    const url = buildExplorerAddressUrl({
                      chain: "kite-testnet",
                      address: focused.ownerAddress
                    });
                    return url ? (
                      <a href={url} target="_blank" rel="noreferrer">
                        {focused.ownerAddress}
                      </a>
                    ) : (
                      focused.ownerAddress
                    );
                  })()
                : "unknown"}
            </p>
          </div>

          <div className="dash-detail-block">
            <p className="dash-detail-label">Executor EOA</p>
            <p className="dash-detail-line">{focused.eoaAddress || "unknown"}</p>
          </div>

          <div className="dash-detail-block">
            <p className="dash-detail-label">Session Start</p>
            <p className="dash-detail-line">{focused.createdAt}</p>
          </div>

          <div className="dash-detail-block">
            <p className="dash-detail-label">Budget</p>
            <div className="dash-budget-bar">
              <div
                className={`dash-budget-fill ${isBudgetExhausted ? "exhausted" : ""}`}
                style={{ width: `${budgetPercent}%` }}
              />
            </div>
            <p className="dash-detail-line">
              ${focused.spentTodayUsd} / ${focused.dailyBudgetUsd}
              {isBudgetExhausted ? " (exhausted)" : ""}
            </p>
          </div>

          <div className="dash-filter-row">
            <button className="dash-filter" onClick={() => void onStart(focused.id)} type="button">
              start
            </button>
            <button className="dash-filter" onClick={() => void onStop(focused.id)} type="button">
              stop
            </button>
            <button
              className="dash-filter active"
              onClick={() => void onTrigger(focused.id)}
              type="button"
            >
              trigger
            </button>
          </div>
        </div>
      ) : (
        <p className="dash-empty-inline">No agents available.</p>
      )}
    </article>
  );
}

function SpotTab({ trades }: { trades: TradeVM[] }) {
  const exposure = useDerivedExposure(trades);
  const monadTrades = trades.filter(
    (t) => t.executionChain === "monad-testnet" || t.executionChain === "monad"
  );

  return (
    <>
      <article className="dash-panel">
        <header className="dash-panel-head">
          <h3>Derived Exposure</h3>
          <p className="pixel-text">spot token holdings from trade history</p>
        </header>

        {exposure.length > 0 ? (
          <div className="dash-exposure-grid">
            {exposure.map((token) => (
              <div key={token.symbol} className="dash-exposure-card">
                <p className="pixel-text">{token.symbol}</p>
                <h4 className={token.amount >= 0 ? "positive" : "negative"}>
                  {token.amount >= 0 ? "+" : ""}
                  {token.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                </h4>
              </div>
            ))}
          </div>
        ) : (
          <p className="dash-empty-inline">No confirmed trades to calculate exposure.</p>
        )}
      </article>

      <article className="dash-panel">
        <header className="dash-panel-head">
          <h3>Spot Trades</h3>
          <p className="pixel-text">Monad testnet executions</p>
        </header>

        {monadTrades.length > 0 ? (
          <div className="dash-table">
            <div className="dash-table-head dash-table-head-6">
              <span>time</span>
              <span>pair</span>
              <span>amounts</span>
              <span>status</span>
              <span>swap tx</span>
              <span>attestation</span>
            </div>
            {monadTrades.slice(0, 10).map((trade) => (
              <div key={trade.id} className="dash-table-row dash-table-row-6">
                <span>{trade.createdAt}</span>
                <span>{trade.pair}</span>
                <span>
                  {trade.amountIn} / {trade.amountOut}
                </span>
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
                <span>
                  {trade.executionTxHash
                    ? (() => {
                        const url = buildExplorerTxUrl({
                          chain: "monad-testnet",
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
                <span>
                  {trade.kiteAttestationTx
                    ? (() => {
                        const url = buildExplorerTxUrl({
                          chain: "kite-testnet",
                          txHash: trade.kiteAttestationTx
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
        ) : (
          <p className="dash-empty-inline">No Monad trades executed yet.</p>
        )}
      </article>
    </>
  );
}

function PaymentsTab({ payments, trades }: { payments: PaymentVM[]; trades: TradeVM[] }) {
  const settledPayments = payments.filter((p) => p.status === "settled");
  const attestedTrades = trades.filter((t) => t.kiteAttestationTx);

  const totalSettledUsd = settledPayments.reduce(
    (sum, p) => sum + parseFloat(p.amountUsd || "0"),
    0
  );

  return (
    <>
      <article className="dash-panel">
        <header className="dash-panel-head">
          <h3>Payment Summary</h3>
          <p className="pixel-text">x402 lifecycle overview</p>
        </header>

        <div className="dash-kpi-grid">
          <div className="dash-kpi-card">
            <p className="pixel-text">Total Settled</p>
            <h3>${totalSettledUsd.toFixed(2)}</h3>
            <p>{settledPayments.length} payments</p>
          </div>
          <div className="dash-kpi-card">
            <p className="pixel-text">Attested Trades</p>
            <h3>{attestedTrades.length}</h3>
            <p>on Kite</p>
          </div>
          <div className="dash-kpi-card">
            <p className="pixel-text">Latest Payment</p>
            <h3>{settledPayments[0]?.createdAt || "N/A"}</h3>
            <p>{settledPayments[0]?.serviceUrl || "-"}</p>
          </div>
          <div className="dash-kpi-card">
            <p className="pixel-text">Pending</p>
            <h3>
              {payments.filter((p) => p.status !== "settled" && p.status !== "failed").length}
            </h3>
            <p>in flight</p>
          </div>
        </div>
      </article>

      <article className="dash-panel">
        <header className="dash-panel-head">
          <h3>Settlements</h3>
          <p className="pixel-text">Kite transaction proof</p>
        </header>

        <div className="dash-table">
          <div className="dash-table-head">
            <span>time</span>
            <span>service</span>
            <span>amount</span>
            <span>tx</span>
            <span>status</span>
          </div>
          {payments.slice(0, 8).map((payment) => (
            <div key={payment.id} className="dash-table-row">
              <span>{payment.createdAt}</span>
              <span>{payment.serviceUrl}</span>
              <span>${payment.amountUsd}</span>
              <span>
                {payment.txHash
                  ? (() => {
                      const url = buildExplorerTxUrl({
                        chain: "kite-testnet",
                        txHash: payment.txHash
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
            </div>
          ))}
        </div>
      </article>

      <article className="dash-panel">
        <header className="dash-panel-head">
          <h3>Attestations</h3>
          <p className="pixel-text">Kite on-chain trade records</p>
        </header>

        {attestedTrades.length > 0 ? (
          <div className="dash-table">
            <div className="dash-table-head">
              <span>time</span>
              <span>pair</span>
              <span>attestation tx</span>
              <span>swap tx</span>
            </div>
            {attestedTrades.slice(0, 5).map((trade) => (
              <div key={trade.id} className="dash-table-row">
                <span>{trade.createdAt}</span>
                <span>{trade.pair}</span>
                <span>
                  {trade.kiteAttestationTx
                    ? (() => {
                        const url = buildExplorerTxUrl({
                          chain: "kite-testnet",
                          txHash: trade.kiteAttestationTx
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
        ) : (
          <p className="dash-empty-inline">No attested trades yet.</p>
        )}
      </article>
    </>
  );
}

function StreamTab({
  activity,
  connectionStatus
}: {
  activity: ActivityVM[];
  connectionStatus: string;
}) {
  const streamStatus = useQuickNodeStreamStatus(activity);
  const livelineData = useLivelineData(activity);

  const formatTimeSince = (ms: number): string => {
    if (!isFinite(ms)) return "never";
    if (ms < 1000) return `${ms}ms ago`;
    if (ms < 60000) return `${Math.floor(ms / 1000)}s ago`;
    return `${Math.floor(ms / 60000)}m ago`;
  };

  const getBlockNumber = (event: ActivityVM): string | null => {
    const match = event.detail.match(/blockNumber:(\d+)/);
    return match ? match[1] : null;
  };

  return (
    <>
      <article className="dash-panel">
        <header className="dash-panel-head">
          <h3>Stream Health</h3>
          <p className="pixel-text">QuickNode webhook status</p>
        </header>

        <div className="dash-kpi-grid">
          <div className="dash-kpi-card">
            <p className="pixel-text">QuickNode Status</p>
            <h3 className={`dash-stream-${streamStatus.status}`}>{streamStatus.status}</h3>
            <p>{formatTimeSince(streamStatus.timeSinceLastMs)}</p>
          </div>
          <div className="dash-kpi-card">
            <p className="pixel-text">Events Received</p>
            <h3>{streamStatus.eventCount}</h3>
            <p>block.received</p>
          </div>
          <div className="dash-kpi-card">
            <p className="pixel-text">WebSocket</p>
            <h3
              className={
                connectionStatus === "connected" ? "dash-stream-healthy" : "dash-stream-degraded"
              }
            >
              {connectionStatus}
            </h3>
            <p>realtime</p>
          </div>
          <div className="dash-kpi-card">
            <p className="pixel-text">Latest Block</p>
            <h3>
              {streamStatus.lastEvent ? getBlockNumber(streamStatus.lastEvent) || "N/A" : "N/A"}
            </h3>
            <p>Monad testnet</p>
          </div>
        </div>
      </article>

      <article className="dash-panel">
        <header className="dash-panel-head">
          <h3>Block Stream Graph</h3>
          <p className="pixel-text">Liveline visualization</p>
        </header>

        <div className="dash-liveline-container">
          {livelineData.length > 1 ? (
            <LivelineGraph data={livelineData} />
          ) : (
            <div className="dash-liveline-placeholder">
              <p className="pixel-text">No QuickNode events yet</p>
              <p>Block data will appear here when webhooks are active</p>
            </div>
          )}
        </div>
      </article>

      <article className="dash-panel">
        <header className="dash-panel-head">
          <h3>Recent Events</h3>
          <p className="pixel-text">quicknode.block.received</p>
        </header>

        <div className="dash-feed-list">
          {activity
            .filter((e) => e.eventType === "quicknode.block.received")
            .slice(0, 10)
            .map((event) => (
              <div key={event.id} className="dash-feed-row">
                <p className="pixel-text">{event.createdAt}</p>
                <p className="dash-feed-title">{event.eventType}</p>
                <p>{event.detail}</p>
                <p className="pixel-text">{event.chain}</p>
              </div>
            ))}
          {activity.filter((e) => e.eventType === "quicknode.block.received").length === 0 && (
            <p className="dash-empty-inline">No QuickNode events received yet.</p>
          )}
        </div>
      </article>
    </>
  );
}

export function CockpitRouteClient() {
  const runtime = useDashboardRuntime();
  const [activeTab, setActiveTab] = useState<CockpitTab>("session");
  const [apiHealth, setApiHealth] = useState("checking");

  useEffect(() => {
    void pingApi()
      .then(setApiHealth)
      .catch(() => setApiHealth("unreachable"));
  }, []);

  const tabs: Array<{ id: CockpitTab; label: string }> = [
    { id: "session", label: "Session" },
    { id: "spot", label: "Spot" },
    { id: "payments", label: "Payments" },
    { id: "stream", label: "Stream" }
  ];

  return (
    <RequireSession>
      <RouteShell
        title="Cockpit"
        subtitle="judge-facing trading cockpit"
        apiHealth={apiHealth}
        connectionStatus={runtime.connectionStatus}
      >
        <nav className="dash-cockpit-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`dash-cockpit-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {runtime.error ? <p className="dash-empty-inline">{runtime.error}</p> : null}

        <section className="dash-route-stack">
          {activeTab === "session" && (
            <SessionTab
              agents={runtime.agents}
              onStart={runtime.startAgent}
              onStop={runtime.stopAgent}
              onTrigger={runtime.triggerAgent}
            />
          )}
          {activeTab === "spot" && <SpotTab trades={runtime.trades} />}
          {activeTab === "payments" && (
            <PaymentsTab payments={runtime.payments} trades={runtime.trades} />
          )}
          {activeTab === "stream" && (
            <StreamTab activity={runtime.activity} connectionStatus={runtime.connectionStatus} />
          )}
        </section>
      </RouteShell>
    </RequireSession>
  );
}
