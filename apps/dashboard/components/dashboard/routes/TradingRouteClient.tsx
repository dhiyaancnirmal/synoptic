"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  executeTrade,
  getTradeSupportedChains,
  listLiquidityActions,
  pingApi,
  quoteLiquidity,
  quoteTrade,
  runLiquidityAction,
  type LiquidityActionRequest,
  type LiquidityActionVm,
  type SupportedChainsResponse,
  type TradeIntent,
  type TradeQuoteResponse,
  type TradeRoutingType
} from "@/lib/api/client";
import { buildExplorerTxUrl } from "@/lib/api/explorer";
import { RequireSession } from "@/components/dashboard/RequireSession";
import { RouteShell } from "@/components/dashboard/RouteShell";
import { MonadTopTokensPanel } from "@/components/dashboard/routes/MonadTopTokensPanel";
import { useDashboardRuntime } from "@/lib/state/use-dashboard-runtime";
import { computeLiquidityPreset } from "@/lib/liquidity/presets";

const MONAD_CHAIN_ID = 143;
const MONAD_TESTNET_CHAIN_ID = 10143;
const NATIVE_MON = "0x0000000000000000000000000000000000000000";
const WMON_MONAD = "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A";
const WMON_MONAD_TESTNET = "0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701";
const USDC_MONAD = "0x62534e4BbD6d9EBAC0ac99aeAa0aa48e56372df0";
const FALLBACK_SUPPORTED_CHAINS = [
  { chainId: MONAD_CHAIN_ID, name: "monad", supportsSwaps: true, supportsLp: true },
  { chainId: MONAD_TESTNET_CHAIN_ID, name: "monad-testnet", supportsSwaps: false, supportsLp: false }
];

const ROUTING_TYPES: TradeRoutingType[] = [
  "CLASSIC",
  "DUTCH_LIMIT",
  "DUTCH_V2",
  "LIMIT_ORDER",
  "WRAP",
  "UNWRAP",
  "BRIDGE",
  "PRIORITY",
  "DUTCH_V3",
  "QUICKROUTE",
  "CHAINED"
];

const TRADE_STAGES = ["quoting", "approving", "signing", "broadcast", "confirmed", "reverted", "failed"] as const;

const TRADE_STAGE_RANK: Record<(typeof TRADE_STAGES)[number], number> = {
  quoting: 0,
  approving: 1,
  signing: 2,
  broadcast: 3,
  confirmed: 4,
  reverted: 5,
  failed: 6
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatBound(value: number): string {
  const percentage = (value * 100).toFixed(2);
  return `${percentage}%`;
}

function defaultPairForChain(chainId: number, supportedChains?: SupportedChainsResponse): {
  tokenIn: string;
  tokenOut: string;
  intent: TradeIntent;
} {
  const apiDefault = supportedChains?.defaultTradePair;
  if (chainId === MONAD_TESTNET_CHAIN_ID) {
    return {
      tokenIn: NATIVE_MON,
      tokenOut: WMON_MONAD_TESTNET,
      intent: "swap"
    };
  }
  if (chainId === MONAD_CHAIN_ID) {
    return {
      tokenIn: NATIVE_MON,
      tokenOut: WMON_MONAD,
      intent: "swap"
    };
  }
  if (apiDefault) {
    return {
      tokenIn: apiDefault.tokenIn,
      tokenOut: apiDefault.tokenOut,
      intent: apiDefault.intent
    };
  }
  return {
    tokenIn: NATIVE_MON,
    tokenOut: WMON_MONAD,
    intent: "swap"
  };
}

export function TradingRouteClient() {
  const runtime = useDashboardRuntime();
  const searchParams = useSearchParams();
  const [apiHealth, setApiHealth] = useState("checking");
  const [supportedChains, setSupportedChains] = useState<SupportedChainsResponse>();
  const [selectedChainId, setSelectedChainId] = useState(MONAD_CHAIN_ID);
  const [tradeIntent, setTradeIntent] = useState<TradeIntent>("swap");
  const [routingType, setRoutingType] = useState<TradeRoutingType>("CLASSIC");
  const [tokenIn, setTokenIn] = useState(NATIVE_MON);
  const [tokenOut, setTokenOut] = useState(WMON_MONAD);
  const [amountIn, setAmountIn] = useState("1");
  const [slippageTolerance, setSlippageTolerance] = useState("0.5");
  const [urgency, setUrgency] = useState<"normal" | "fast">("normal");
  const [autoSlippage, setAutoSlippage] = useState(true);
  const [tradeQuoteResult, setTradeQuoteResult] = useState<TradeQuoteResponse | null>(null);
  const [tradeBusy, setTradeBusy] = useState<"quote" | "execute" | null>(null);
  const [tradeMessage, setTradeMessage] = useState<string | null>(null);

  const [lpToken0, setLpToken0] = useState(WMON_MONAD);
  const [lpToken1, setLpToken1] = useState(USDC_MONAD);
  const [lpAmount0, setLpAmount0] = useState("1");
  const [lpAmount1, setLpAmount1] = useState("1");
  const [lpFeeTier, setLpFeeTier] = useState("3000");
  const [lpPreset, setLpPreset] = useState<"uniform" | "bell" | "bid_ask_inverse">("uniform");
  const [lpRisk, setLpRisk] = useState(0.5);
  const [lpPositionId, setLpPositionId] = useState("");
  const [lpQuoteResult, setLpQuoteResult] = useState<Record<string, unknown> | null>(null);
  const [lpBusyAction, setLpBusyAction] = useState<"quote" | "create" | "increase" | "decrease" | "collect" | null>(null);
  const [lpMessage, setLpMessage] = useState<string | null>(null);
  const [liquidityActions, setLiquidityActions] = useState<LiquidityActionVm[]>([]);

  useEffect(() => {
    void pingApi().then(setApiHealth).catch(() => setApiHealth("unreachable"));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadCapabilities(): Promise<void> {
      try {
        const [chains, actions] = await Promise.all([
          getTradeSupportedChains(runtime.token || undefined),
          listLiquidityActions(200, runtime.token || undefined)
        ]);
        if (cancelled) return;
        setSupportedChains(chains);
        const availableChains = chains.chains.length > 0 ? chains.chains : FALLBACK_SUPPORTED_CHAINS;
        const defaultChainId =
          chains.executionChainId ??
          availableChains.find((chain) => chain.chainId === MONAD_CHAIN_ID)?.chainId ??
          availableChains[0]?.chainId ??
          MONAD_CHAIN_ID;
        setSelectedChainId(defaultChainId);
        const defaultPair = defaultPairForChain(defaultChainId, chains);
        setTokenIn(defaultPair.tokenIn);
        setTokenOut(defaultPair.tokenOut);
        setTradeIntent(defaultPair.intent);
        if (defaultChainId === MONAD_TESTNET_CHAIN_ID) {
          setLpToken0(WMON_MONAD_TESTNET);
          setLpToken1(USDC_MONAD);
        } else {
          setLpToken0(WMON_MONAD);
          setLpToken1(USDC_MONAD);
        }
        if (actions.length > 0) setLiquidityActions(actions);
      } catch (cause) {
        if (!cancelled) {
          const message = cause instanceof Error ? cause.message : "Failed to load trading capabilities";
          setTradeMessage(message);
        }
      }
    }
    void loadCapabilities();
    return () => {
      cancelled = true;
    };
  }, [runtime.token]);

  const confirmedTrades = useMemo(
    () => runtime.trades.filter((trade) => trade.status === "confirmed"),
    [runtime.trades]
  );
  const notionalIn = useMemo(
    () =>
      confirmedTrades.reduce((sum, trade) => {
        const numeric = Number(trade.amountIn);
        return sum + (Number.isFinite(numeric) ? numeric : 0);
      }, 0),
    [confirmedTrades]
  );
  const notionalOut = useMemo(
    () =>
      confirmedTrades.reduce((sum, trade) => {
        const numeric = Number(trade.amountOut);
        return sum + (Number.isFinite(numeric) ? numeric : 0);
      }, 0),
    [confirmedTrades]
  );
  const flowBias = useMemo(() => {
    const denominator = notionalIn + notionalOut;
    if (denominator <= 0) return 0;
    return clamp((notionalOut - notionalIn) / denominator, -1, 1);
  }, [notionalIn, notionalOut]);
  const volatilityScore = useMemo(() => {
    const values = confirmedTrades
      .map((trade) => Number(trade.amountIn))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (values.length <= 1) return 0.15;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    if (mean <= 0) return 0.15;
    const variance =
      values.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / values.length;
    return clamp(Math.sqrt(variance) / mean, 0, 1);
  }, [confirmedTrades]);

  const presetComputation = useMemo(
    () =>
      computeLiquidityPreset(lpPreset, {
        volatilityScore,
        flowBias,
        risk: lpRisk
      }),
    [flowBias, lpPreset, lpRisk, volatilityScore]
  );

  const selectedTradeId = searchParams.get("tradeId");
  const selectedTrade =
    (selectedTradeId ? runtime.trades.find((trade) => trade.id === selectedTradeId) : undefined) ??
    runtime.trades[0];

  const availableChains = supportedChains?.chains ?? FALLBACK_SUPPORTED_CHAINS;
  const selectedChain = availableChains.find((chain) => chain.chainId === selectedChainId);
  const selectedMode = supportedChains?.effectiveModeByChain?.[String(selectedChainId)] ?? "live";
  const selectedChainSimulated = selectedMode === "simulated";
  const lpUnsupportedInSelectedMode = selectedMode === "live" && Boolean(selectedChain && !selectedChain.supportsLp);

  const fallbackLpChains = useMemo(() => {
    return availableChains.filter((chain) => {
      if (chain.chainId === selectedChainId) return false;
      const chainMode = supportedChains?.effectiveModeByChain?.[String(chain.chainId)] ?? "live";
      return chainMode === "simulated" || chain.supportsLp;
    });
  }, [availableChains, selectedChainId, supportedChains]);

  async function refreshLiquidityLedger(): Promise<void> {
    try {
      const actions = await listLiquidityActions(200, runtime.token || undefined);
      setLiquidityActions(actions);
    } catch {
      // ignored; explicit action handlers report errors
    }
  }

  async function handleQuoteTrade(): Promise<void> {
    setTradeBusy("quote");
    setTradeMessage(null);
    try {
      const quote = await quoteTrade(
        {
          tokenIn,
          tokenOut,
          amountIn,
          chainId: selectedChainId,
          intent: tradeIntent,
          routingType,
          slippageTolerance: autoSlippage ? undefined : Number(slippageTolerance),
          urgency,
          autoSlippage
        },
        runtime.token || undefined
      );
      setTradeQuoteResult(quote);
      if (quote.simulation?.enabled) {
        setTradeMessage(
          `Quoted ${quote.routing} (${quote.intent}) amountOut=${quote.amountOut} [simulated: ${quote.simulation.reason}]`
        );
      } else {
        setTradeMessage(`Quoted ${quote.routing} (${quote.intent}) amountOut=${quote.amountOut}`);
      }
    } catch (cause) {
      setTradeMessage(cause instanceof Error ? cause.message : "Quote failed");
    } finally {
      setTradeBusy(null);
    }
  }

  async function handleExecuteTrade(): Promise<void> {
    if (!tradeQuoteResult?.quote) {
      setTradeMessage("Quote first before execute.");
      return;
    }
    setTradeBusy("execute");
    setTradeMessage(null);
    try {
      const executeResult = await executeTrade(
        {
          quoteResponse: tradeQuoteResult.quote,
          chainId: selectedChainId,
          tokenIn,
          tokenOut,
          amountIn,
          intent: tradeIntent,
          routingType
        },
        runtime.token || undefined
      );
      if (executeResult.simulation?.enabled) {
        setTradeMessage(`Trade simulated and marked confirmed (${executeResult.simulation.reason}).`);
      } else {
        setTradeMessage("Trade execution submitted and confirmed.");
      }
      setTradeQuoteResult(null);
      await runtime.refresh();
    } catch (cause) {
      setTradeMessage(cause instanceof Error ? cause.message : "Execute failed");
    } finally {
      setTradeBusy(null);
    }
  }

  function buildLiquidityPayload(
    overrides: Partial<LiquidityActionRequest> = {}
  ): LiquidityActionRequest {
    const firstBand = presetComputation.bands[0];
    return {
      chainId: selectedChainId,
      token0: lpToken0,
      token1: lpToken1,
      feeTier: Number(lpFeeTier),
      preset: lpPreset,
      lowerBoundPct: firstBand?.lowerBoundPct ?? -0.2,
      upperBoundPct: firstBand?.upperBoundPct ?? 0.2,
      amount0: lpAmount0,
      amount1: lpAmount1,
      positionId: lpPositionId || undefined,
      ...overrides
    };
  }

  async function handleLiquidityQuote(): Promise<void> {
    setLpBusyAction("quote");
    setLpMessage(null);
    try {
      const response = await quoteLiquidity(buildLiquidityPayload(), runtime.token || undefined);
      setLpQuoteResult(response);
      setLpMessage("LP quote generated.");
    } catch (cause) {
      setLpMessage(cause instanceof Error ? cause.message : "LP quote failed");
    } finally {
      setLpBusyAction(null);
    }
  }

  async function handleLiquidityMutate(action: "create" | "increase" | "decrease" | "collect"): Promise<void> {
    if (lpUnsupportedInSelectedMode) {
      setLpMessage(`Liquidity is unsupported for ${selectedChain?.name ?? selectedChainId} in live mode.`);
      return;
    }

    setLpBusyAction(action);
    setLpMessage(null);
    try {
      if (
        action !== "collect" &&
        lpPreset === "bid_ask_inverse" &&
        presetComputation.executeAsSeparateLegs
      ) {
        for (const band of presetComputation.bands) {
          await runLiquidityAction(
            action,
            buildLiquidityPayload({
              lowerBoundPct: band.lowerBoundPct,
              upperBoundPct: band.upperBoundPct
            }),
            runtime.token || undefined
          );
        }
      } else {
        await runLiquidityAction(action, buildLiquidityPayload(), runtime.token || undefined);
      }
      setLpMessage(`Liquidity ${action} action completed.`);
      await Promise.all([refreshLiquidityLedger(), runtime.refresh()]);
    } catch (cause) {
      setLpMessage(cause instanceof Error ? cause.message : `Liquidity ${action} failed`);
    } finally {
      setLpBusyAction(null);
    }
  }

  return (
    <RequireSession>
      <RouteShell
        title="Trading"
        subtitle="swaps/orders execution plus liquidity provision control plane"
        apiHealth={apiHealth}
        connectionStatus={runtime.connectionStatus}
      >
        <article className="dash-panel">
            <header className="dash-panel-head">
              <h3>Capability Strip</h3>
              <p className="pixel-text">Dual-mode execution with explicit live/simulated chain routing</p>
            </header>
            <div className="dash-metric-strip">
              <div>
                <p className="pixel-text">execution mode</p>
                <strong>{supportedChains?.executionMode ?? "auto"}</strong>
              </div>
              <div>
                <p className="pixel-text">selected chain mode</p>
                <strong>{selectedMode}</strong>
              </div>
              <div>
                <p className="pixel-text">swap/order</p>
                <strong>{selectedChain?.supportsSwaps ? "enabled" : "check support"}</strong>
              </div>
              <div>
                <p className="pixel-text">liquidity</p>
                <strong>{selectedMode === "simulated" ? "simulated" : selectedChain?.supportsLp ? "enabled" : "unsupported"}</strong>
              </div>
              <div>
                <p className="pixel-text">confirmed trades</p>
                <strong>{confirmedTrades.length}</strong>
              </div>
            <div>
              <p className="pixel-text">flow bias</p>
              <strong>{flowBias.toFixed(3)}</strong>
            </div>
            <div>
              <p className="pixel-text">volatility score</p>
              <strong>{volatilityScore.toFixed(3)}</strong>
            </div>
          </div>
        </article>

        <MonadTopTokensPanel />

        <div className="dash-two-pane">
          <article className="dash-panel">
            <header className="dash-panel-head">
              <h3>Swaps &amp; Orders</h3>
              <p className="pixel-text">quote, execute, and monitor routing lifecycle</p>
            </header>

            <div className="dash-form-grid">
              <label>
                <span className="pixel-text">Intent</span>
                <select value={tradeIntent} onChange={(event) => setTradeIntent(event.target.value as TradeIntent)}>
                  <option value="swap">swap</option>
                  <option value="order">order</option>
                </select>
              </label>
              <label>
                <span className="pixel-text">Routing Type</span>
                <select
                  value={routingType}
                  onChange={(event) => setRoutingType(event.target.value as TradeRoutingType)}
                >
                  {ROUTING_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="pixel-text">Chain</span>
                <select
                  value={String(selectedChainId)}
                  onChange={(event) => {
                    const nextChainId = Number(event.target.value);
                    setSelectedChainId(nextChainId);
                    const nextPair = defaultPairForChain(nextChainId, supportedChains);
                    setTokenIn(nextPair.tokenIn);
                    setTokenOut(nextPair.tokenOut);
                    setTradeIntent(nextPair.intent);
                    if (nextChainId === MONAD_TESTNET_CHAIN_ID) {
                      setLpToken0(WMON_MONAD_TESTNET);
                      setLpToken1(USDC_MONAD);
                    } else if (nextChainId === MONAD_CHAIN_ID) {
                      setLpToken0(WMON_MONAD);
                      setLpToken1(USDC_MONAD);
                    }
                  }}
                >
                  {availableChains.map((chain) => (
                    <option key={chain.chainId} value={chain.chainId}>
                      {chain.name ?? `chain-${chain.chainId}`} ({chain.chainId})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="pixel-text">Amount In</span>
                <input value={amountIn} onChange={(event) => setAmountIn(event.target.value)} />
              </label>
              <label>
                <span className="pixel-text">Token In</span>
                <input value={tokenIn} onChange={(event) => setTokenIn(event.target.value)} />
              </label>
              <label>
                <span className="pixel-text">Token Out</span>
                <input value={tokenOut} onChange={(event) => setTokenOut(event.target.value)} />
              </label>
              <label>
                <span className="pixel-text">Slippage %</span>
                <input
                  value={slippageTolerance}
                  onChange={(event) => setSlippageTolerance(event.target.value)}
                  disabled={autoSlippage}
                />
              </label>
              <label>
                <span className="pixel-text">Urgency</span>
                <select value={urgency} onChange={(event) => setUrgency(event.target.value as "normal" | "fast")}>
                  <option value="normal">normal</option>
                  <option value="fast">fast</option>
                </select>
              </label>
              <label className="dash-checkbox-label">
                <span className="pixel-text">Auto Slippage</span>
                <input
                  type="checkbox"
                  checked={autoSlippage}
                  onChange={(event) => setAutoSlippage(event.target.checked)}
                />
              </label>
            </div>

            <div className="dash-action-rail">
              <button className="dash-btn" onClick={() => void handleQuoteTrade()} disabled={tradeBusy !== null}>
                {tradeBusy === "quote" ? "Quoting..." : "Quote"}
              </button>
              <button
                className="dash-btn"
                onClick={() => void handleExecuteTrade()}
                disabled={tradeBusy !== null || tradeQuoteResult === null}
              >
                {tradeBusy === "execute" ? "Executing..." : "Execute"}
              </button>
            </div>
            {selectedChainSimulated ? (
              <p className="dash-empty-inline">
                Simulated execution active for chain {selectedChainId}. Quotes and executes are mocked.
              </p>
            ) : null}
            {tradeMessage ? <p className="dash-empty-inline">{tradeMessage}</p> : null}

            {tradeQuoteResult ? (
              <div className="dash-inline-code">
                <p>
                  requestId <strong>{tradeQuoteResult.requestId || "n/a"}</strong> | routing{" "}
                  <strong>{tradeQuoteResult.routing}</strong> | amountOut{" "}
                  <strong>{tradeQuoteResult.amountOut}</strong>
                </p>
              </div>
            ) : null}

            {selectedTrade ? (
              <ol className="dash-flow-rail">
                {TRADE_STAGES.map((stage, index) => {
                  const selectedRank =
                    TRADE_STAGE_RANK[(selectedTrade.status as keyof typeof TRADE_STAGE_RANK) ?? "failed"] ?? 0;
                  const currentRank = TRADE_STAGE_RANK[stage];
                  const active =
                    selectedTrade.status === "confirmed"
                      ? currentRank <= TRADE_STAGE_RANK.confirmed
                      : currentRank <= selectedRank;
                  const isCurrent = selectedTrade.status === stage;
                  return (
                    <li key={stage}>
                      <span className="pixel-text">0{index + 1}</span>
                      <p>{stage}</p>
                      <span
                        className={`dash-status ${
                          selectedTrade.status === "failed" || selectedTrade.status === "reverted"
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

            <div className="dash-table">
              <div className="dash-table-head dash-table-head-9">
                <span>time</span>
                <span>pair</span>
                <span>intent</span>
                <span>routing</span>
                <span>amounts</span>
                <span>status</span>
                <span>swap tx</span>
                <span>attest</span>
                <span>events</span>
              </div>
              {runtime.trades.map((trade) => (
                <div
                  className={`dash-table-row dash-table-row-9 ${selectedTrade?.id === trade.id ? "active" : ""}`}
                  key={trade.id}
                >
                  <span>{trade.createdAt}</span>
                  <span>{trade.pair}</span>
                  <span>{trade.intent ?? "swap"}</span>
                  <span>{trade.routingType}</span>
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
                      : "N/A"}
                  </span>
                  <span>
                    {trade.kiteAttestationTx
                      ? (() => {
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
                      : "N/A"}
                  </span>
                  <span>
                    {trade.id.slice(0, 8)}
                  </span>
                </div>
              ))}
            </div>
          </article>

          <article className="dash-panel">
            <header className="dash-panel-head">
              <h3>Liquidity Provision</h3>
              <p className="pixel-text">preset-driven bands with quote/create/increase/decrease/collect</p>
            </header>

            {lpUnsupportedInSelectedMode ? (
              <p className="dash-empty-inline">
                Liquidity actions are unsupported on {selectedChain?.name ?? selectedChainId} in live mode.
                {fallbackLpChains.length > 0 ? (
                  <>
                    {" "}
                    <button
                      className="dash-inline-link"
                      onClick={() => setSelectedChainId(fallbackLpChains[0]!.chainId)}
                    >
                      use {fallbackLpChains[0]!.name ?? fallbackLpChains[0]!.chainId}
                    </button>
                  </>
                ) : null}
              </p>
            ) : null}
            {selectedChainSimulated ? (
              <p className="dash-empty-inline">
                Simulated liquidity mode active for chain {selectedChainId}. Actions are synthetic and deterministic.
              </p>
            ) : null}

            <div className="dash-form-grid">
              <label>
                <span className="pixel-text">Preset</span>
                <select
                  value={lpPreset}
                  onChange={(event) =>
                    setLpPreset(event.target.value as "uniform" | "bell" | "bid_ask_inverse")
                  }
                >
                  <option value="uniform">Uniform</option>
                  <option value="bell">Bell-Shaped</option>
                  <option value="bid_ask_inverse">Bid-Ask (Inverse)</option>
                </select>
              </label>
              <label>
                <span className="pixel-text">Risk ({lpRisk.toFixed(2)})</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={lpRisk}
                  onChange={(event) => setLpRisk(Number(event.target.value))}
                />
              </label>
              <label>
                <span className="pixel-text">Fee Tier</span>
                <input value={lpFeeTier} onChange={(event) => setLpFeeTier(event.target.value)} />
              </label>
              <label>
                <span className="pixel-text">Position Id</span>
                <input value={lpPositionId} onChange={(event) => setLpPositionId(event.target.value)} />
              </label>
              <label>
                <span className="pixel-text">Token0</span>
                <input value={lpToken0} onChange={(event) => setLpToken0(event.target.value)} />
              </label>
              <label>
                <span className="pixel-text">Token1</span>
                <input value={lpToken1} onChange={(event) => setLpToken1(event.target.value)} />
              </label>
              <label>
                <span className="pixel-text">Amount0</span>
                <input value={lpAmount0} onChange={(event) => setLpAmount0(event.target.value)} />
              </label>
              <label>
                <span className="pixel-text">Amount1</span>
                <input value={lpAmount1} onChange={(event) => setLpAmount1(event.target.value)} />
              </label>
            </div>

            <div className="dash-inline-code">
              {presetComputation.bands.map((band) => (
                <p key={`${band.leg ?? "single"}-${band.lowerBoundPct}-${band.upperBoundPct}`}>
                  {band.leg ? `${band.leg}: ` : ""}
                  {formatBound(band.lowerBoundPct)} to {formatBound(band.upperBoundPct)}
                </p>
              ))}
            </div>

            <div className="dash-action-rail">
              <button
                className="dash-btn"
                onClick={() => void handleLiquidityQuote()}
                disabled={lpBusyAction !== null || lpUnsupportedInSelectedMode}
              >
                {lpBusyAction === "quote" ? "Quoting..." : "Quote"}
              </button>
              <button
                className="dash-btn"
                onClick={() => void handleLiquidityMutate("create")}
                disabled={lpBusyAction !== null || lpUnsupportedInSelectedMode}
              >
                {lpBusyAction === "create" ? "Creating..." : "Create"}
              </button>
              <button
                className="dash-btn"
                onClick={() => void handleLiquidityMutate("increase")}
                disabled={lpBusyAction !== null || lpUnsupportedInSelectedMode}
              >
                {lpBusyAction === "increase" ? "Increasing..." : "Increase"}
              </button>
              <button
                className="dash-btn"
                onClick={() => void handleLiquidityMutate("decrease")}
                disabled={lpBusyAction !== null || lpUnsupportedInSelectedMode}
              >
                {lpBusyAction === "decrease" ? "Decreasing..." : "Decrease"}
              </button>
              <button
                className="dash-btn"
                onClick={() => void handleLiquidityMutate("collect")}
                disabled={lpBusyAction !== null || lpUnsupportedInSelectedMode}
              >
                {lpBusyAction === "collect" ? "Collecting..." : "Collect"}
              </button>
            </div>

            {lpMessage ? <p className="dash-empty-inline">{lpMessage}</p> : null}
            {lpQuoteResult ? (
              <pre className="dash-json-preview">{JSON.stringify(lpQuoteResult, null, 2)}</pre>
            ) : null}

            <div className="dash-table">
              <div className="dash-table-head dash-table-head-8">
                <span>time</span>
                <span>action</span>
                <span>pair</span>
                <span>preset</span>
                <span>bounds</span>
                <span>amounts</span>
                <span>status</span>
                <span>tx</span>
              </div>
              {liquidityActions.map((action) => (
                <div key={action.id} className="dash-table-row dash-table-row-8">
                  <span>{action.createdAt}</span>
                  <span>{action.actionType}</span>
                  <span>
                    {action.token0} / {action.token1}
                  </span>
                  <span>{action.preset}</span>
                  <span>
                    {formatBound(action.lowerBoundPct)} to {formatBound(action.upperBoundPct)}
                  </span>
                  <span>
                    {action.amount0} / {action.amount1}
                  </span>
                  <span
                    className={`dash-status ${
                      action.status === "failed"
                        ? "error"
                        : action.status === "confirmed"
                          ? "success"
                          : "challenge"
                    }`}
                  >
                    {action.status}
                  </span>
                  <span>
                    {action.txHash
                      ? (() => {
                          const txUrl = buildExplorerTxUrl({
                            txHash: action.txHash,
                            chainId: action.chainId
                          });
                          return txUrl ? (
                            <a href={txUrl} target="_blank" rel="noreferrer">
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
        </div>
      </RouteShell>
    </RequireSession>
  );
}
