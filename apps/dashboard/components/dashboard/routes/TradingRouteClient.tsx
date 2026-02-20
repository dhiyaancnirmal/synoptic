"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { pingApi } from "@/lib/api/client";
import { buildExplorerTxUrl, resolveChainLabel } from "@/lib/api/explorer";
import { RequireSession } from "@/components/dashboard/RequireSession";
import { RouteShell } from "@/components/dashboard/RouteShell";
import { useDashboardRuntime } from "@/lib/state/use-dashboard-runtime";
import type { TradeVM } from "@/lib/mappers";

interface TokenExposure {
  symbol: string;
  amount: number;
  change: number;
}

interface TokenVolume {
  symbol: string;
  volume: number;
  trades: number;
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
          change: current.change - amountIn,
        });
      }

      if (tokenOut && !isNaN(amountOut)) {
        const current = holdings.get(tokenOut) || { amount: 0, change: 0 };
        holdings.set(tokenOut, {
          amount: current.amount + amountOut,
          change: current.change + amountOut,
        });
      }
    }

    return Array.from(holdings.entries())
      .filter(([, data]) => data.amount !== 0)
      .map(([symbol, data]) => ({
        symbol,
        amount: data.amount,
        change: data.change,
      }))
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  }, [trades]);
}

function useTopTokensByVolume(trades: TradeVM[]): TokenVolume[] {
  return useMemo(() => {
    const volumes = new Map<string, { volume: number; trades: number }>();

    for (const trade of trades) {
      if (trade.executionChain !== "monad-testnet" && trade.executionChain !== "monad") continue;
      if (trade.status !== "confirmed") continue;

      const [tokenInRaw, tokenOutRaw] = trade.pair.split("->").map((s) => s.trim());
      const tokenIn = tokenInRaw || "UNKNOWN";
      const tokenOut = tokenOutRaw || "UNKNOWN";
      const amountIn = Math.abs(parseFloat(trade.amountIn) || 0);
      const amountOut = Math.abs(parseFloat(trade.amountOut) || 0);

      const inCurrent = volumes.get(tokenIn) ?? { volume: 0, trades: 0 };
      volumes.set(tokenIn, {
        volume: inCurrent.volume + amountIn,
        trades: inCurrent.trades + 1,
      });

      const outCurrent = volumes.get(tokenOut) ?? { volume: 0, trades: 0 };
      volumes.set(tokenOut, {
        volume: outCurrent.volume + amountOut,
        trades: outCurrent.trades + 1,
      });
    }

    return Array.from(volumes.entries())
      .map(([symbol, value]) => ({ symbol, volume: value.volume, trades: value.trades }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 5);
  }, [trades]);
}

export function TradingRouteClient() {
  const runtime = useDashboardRuntime();
  const searchParams = useSearchParams();
  const [apiHealth, setApiHealth] = useState("checking");
  useEffect(() => {
    void pingApi().then(setApiHealth).catch(() => setApiHealth("unreachable"));
  }, []);

  const exposure = useDerivedExposure(runtime.trades);
  const topTokens = useTopTokensByVolume(runtime.trades);

  const selectedTradeId = searchParams.get("tradeId");
  const latest =
    (selectedTradeId ? runtime.trades.find((trade) => trade.id === selectedTradeId) : undefined) ?? runtime.trades[0];
  const tradeStages = ["quoting", "approving", "signing", "broadcast", "confirmed", "reverted", "failed"] as const;

  const stageRank: Record<(typeof tradeStages)[number], number> = {
    quoting: 0,
    approving: 1,
    signing: 2,
    broadcast: 3,
    confirmed: 4,
    reverted: 5,
    failed: 6
  };
  const selectedTradeEvents = latest
    ? runtime.activity.filter((event) => event.tradeId === latest.id || event.id === latest.id)
    : [];
  const latestFailureDetail =
    selectedTradeEvents.find((event) =>
      event.eventType.includes("failed") || event.eventType.includes("revert") || event.eventType.includes("error")
    )?.detail ?? (latest?.status === "failed" || latest?.status === "reverted" ? latest?.strategyReason : undefined);

  return (
    <RequireSession>
      <RouteShell
        title="Spot Trading"
        subtitle="execution state machine, exposure, and attestation"
        apiHealth={apiHealth}
        connectionStatus={runtime.connectionStatus}
      >
        <article className="dash-panel">
          <header className="dash-panel-head">
            <h3>Top Tokens by Volume</h3>
            <p className="pixel-text">from confirmed Monad spot trades</p>
          </header>
          {topTokens.length > 0 ? (
            <div className="dash-kpi-grid">
              {topTokens.map((token, index) => (
                <div key={token.symbol} className="dash-kpi-card">
                  <p className="pixel-text">#{index + 1}</p>
                  <h3>{token.symbol}</h3>
                  <p>volume {token.volume.toLocaleString(undefined, { maximumFractionDigits: 6 })}</p>
                  <p>{token.trades} trades</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="dash-empty-inline">No confirmed Monad trades yet to rank tokens.</p>
          )}
        </article>

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
            <h3>Latest Swap</h3>
            <p className="pixel-text">
              quoting {"->"} approving {"->"} signing {"->"} broadcast {"->"} confirmed
            </p>
          </header>
          {latest ? (
            <ol className="dash-flow-rail">
              {tradeStages.map((stage, index) => {
                const selectedRank = stageRank[(latest.status as keyof typeof stageRank) ?? "failed"] ?? 0;
                const currentRank = stageRank[stage];
                const active = latest.status === "confirmed" ? currentRank <= stageRank.confirmed : currentRank <= selectedRank;
                const isCurrent = latest.status === stage;
                return (
                  <li key={stage}>
                    <span className="pixel-text">0{index + 1}</span>
                    <p>{stage}</p>
                    <span
                      className={`dash-status ${
                        latest.status === "failed" || latest.status === "reverted"
                          ? isCurrent
                            ? "error"
                            : active
                              ? "success"
                              : "challenge"
                          : active
                            ? "success"
                            : "challenge"
                      }`}
                    >
                      {isCurrent ? "current" : active ? "done" : "pending"}
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : null}
          {latest ? (
            <div className="dash-trading-cards">
              <div>
                <p className="pixel-text">Pair</p>
                <h4>{latest.pair}</h4>
                <p>stage {latest.stage}</p>
              </div>
              <div>
                <p className="pixel-text">Amounts</p>
                <h4>{latest.amountIn} in</h4>
                <p>{latest.amountOut} out</p>
              </div>
              <div>
                <p className="pixel-text">Execution</p>
                <h4>{resolveChainLabel({ chain: latest.executionChain, chainId: latest.chainId })}</h4>
                <p>{latest.executionTxHash ? "tx captured" : "pending tx hash"}</p>
              </div>
              <div>
                <p className="pixel-text">Kite Attestation</p>
                <h4>{latest.kiteAttestationTx ? "recorded" : "pending"}</h4>
                <p>{latest.strategyReason ?? "No strategy reason"}</p>
              </div>
            </div>
          ) : (
            <p className="dash-empty-inline">No trades yet.</p>
          )}
          {latestFailureDetail ? <p className="dash-empty-inline">failure context: {latestFailureDetail}</p> : null}
        </article>

        <article className="dash-panel">
          <header className="dash-panel-head">
            <h3>Trade Timeline</h3>
            <p className="pixel-text">deterministic + realtime updates</p>
          </header>
          <div className="dash-table">
            <div className="dash-table-head dash-table-head-8">
              <span>time</span>
              <span>agent</span>
              <span>pair</span>
              <span>amounts</span>
              <span>status</span>
              <span>swap tx</span>
              <span>attestation</span>
              <span>activity</span>
            </div>
            {runtime.trades.map((trade) => (
              <div className={`dash-table-row dash-table-row-8 ${latest?.id === trade.id ? "active" : ""}`} key={trade.id}>
                <span>{trade.createdAt}</span>
                <span>{trade.agentId}</span>
                <span>{trade.pair}</span>
                <span>{trade.amountIn} / {trade.amountOut}</span>
                <span className={`dash-status ${trade.status === "failed" || trade.status === "reverted" ? "error" : trade.status === "confirmed" ? "success" : "challenge"}`}>{trade.status}</span>
                <span>
                  {trade.executionTxHash ? (
                    (() => {
                      const txUrl = buildExplorerTxUrl({
                        txHash: trade.executionTxHash,
                        chain: trade.executionChain,
                        chainId: trade.chainId
                      });
                      return txUrl ? (
                        <a href={txUrl} target="_blank" rel="noreferrer">
                          open
                        </a>
                      ) : (
                        "unconfigured"
                      );
                    })()
                  ) : (
                    "N/A"
                  )}
                </span>
                <span>
                  {trade.kiteAttestationTx ? (
                    (() => {
                      const txUrl = buildExplorerTxUrl({
                        chain: "kite-testnet",
                        txHash: trade.kiteAttestationTx
                      });
                      return txUrl ? (
                        <a href={txUrl} target="_blank" rel="noreferrer">
                          open
                        </a>
                      ) : (
                        "unconfigured"
                      );
                    })()
                  ) : (
                    "N/A"
                  )}
                </span>
                <span>
                  <Link href={`/activity?tradeId=${encodeURIComponent(trade.id)}`}>activity</Link>
                </span>
              </div>
            ))}
          </div>
        </article>
      </RouteShell>
    </RequireSession>
  );
}
