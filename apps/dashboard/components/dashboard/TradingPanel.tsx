import type { OrderRecord } from "@synoptic/types/orders";
import type { HealthResponse } from "@synoptic/types/rest";
import type { UnifiedFeedItem } from "./types";

interface TradingPanelProps {
  orders: OrderRecord[];
  events: UnifiedFeedItem[];
  healthDependencies?: HealthResponse["dependencies"];
  runningDemo?: boolean;
  demoError?: string;
  demoEvidence?: {
    quoteId: string;
    orderId: string;
    settlementId: string;
    executionSource: string;
    swapTxHash?: string;
    bridgeSourceTxHash?: string;
    bridgeDestinationTxHash?: string;
  };
  onRunDemoTrade: () => void;
  onRefresh: () => void;
}

function summarizeUniswapEndpoint(baseUrl: string | undefined): string {
  if (!baseUrl) {
    return "not configured";
  }

  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

export function TradingPanel({
  orders,
  events,
  healthDependencies,
  runningDemo = false,
  demoError,
  demoEvidence,
  onRunDemoTrade,
  onRefresh
}: TradingPanelProps) {
  const spotOrders = orders.filter((order) => order.venueType === "SPOT");
  const latest = orders.slice(0, 10);
  const sourceCounts = {
    UNISWAP_API: events.filter((event) => event.executionSource === "UNISWAP_API").length,
    DIRECT_VIEM: events.filter((event) => event.executionSource === "DIRECT_VIEM").length
  };
  const uniswapMode = healthDependencies?.uniswapExecutionMode ?? "unknown";
  const uniswapApiConfigured = healthDependencies?.uniswapApiConfigured ? "api key loaded" : "api key missing";
  const uniswapEndpoint = summarizeUniswapEndpoint(healthDependencies?.uniswapApiBaseUrl);
  const evidenceRows = events
    .filter((event) => event.eventName === "trade.swap.confirmed" || event.eventName === "trade.executed")
    .slice(0, 10);

  return (
    <article className="dash-panel">
      <header className="dash-panel-head">
        <h3>Trading</h3>
        <div className="dash-inline-actions">
          <button type="button" className="dash-filter" onClick={onRunDemoTrade} disabled={runningDemo}>
            {runningDemo ? "running..." : "run demo trade"}
          </button>
          <button type="button" className="dash-filter" onClick={onRefresh} disabled={runningDemo}>
            refresh
          </button>
        </div>
      </header>
      <p className="pixel-text">execution surface</p>
      {demoError ? <p className="dash-error-inline">{demoError}</p> : null}
      {demoEvidence ? (
        <div className="dash-demo-proof">
          <p>{`quote ${demoEvidence.quoteId}`}</p>
          <p>{`order ${demoEvidence.orderId}`}</p>
          <p>{`settlement ${demoEvidence.settlementId}`}</p>
          <p>{`source ${demoEvidence.executionSource}`}</p>
          <p>{`swap tx ${demoEvidence.swapTxHash ?? "N/A"}`}</p>
        </div>
      ) : null}
      <div className="dash-trading-cards">
        <div>
          <p className="pixel-text">Spot</p>
          <h4>Live</h4>
          <p>{spotOrders.length} orders tracked</p>
        </div>
        <div>
          <p className="pixel-text">Source Proof</p>
          <h4>Uniswap evidence</h4>
          <p>{`api ${sourceCounts.UNISWAP_API} direct ${sourceCounts.DIRECT_VIEM}`}</p>
        </div>
        <div>
          <p className="pixel-text">Execution Mode</p>
          <h4>{uniswapMode}</h4>
          <p>{`${uniswapApiConfigured} via ${uniswapEndpoint}`}</p>
        </div>
      </div>
      <div className="dash-table">
        <div className="dash-table-head">
          <span>order</span>
          <span>venue</span>
          <span>side</span>
          <span>market</span>
          <span>size</span>
          <span>status</span>
        </div>
        {latest.map((order) => (
          <div key={order.orderId} className="dash-table-row">
            <span>{order.orderId}</span>
            <span>{order.venueType}</span>
            <span>{order.side}</span>
            <span>{order.marketId}</span>
            <span>{order.size}</span>
            <span>{order.status}</span>
          </div>
        ))}
      </div>
      {latest.length === 0 ? <p className="dash-empty-inline">No orders available.</p> : null}

      <div className="dash-table">
        <div className="dash-table-head">
          <span>time</span>
          <span>event</span>
          <span>source</span>
          <span>quote req</span>
          <span>swap req</span>
          <span>tx</span>
          <span>agent</span>
        </div>
        {evidenceRows.map((event) => (
          <div key={event.id} className="dash-table-row">
            <span>{event.timestamp}</span>
            <span>{event.eventName}</span>
            <span>{event.executionSource ?? "N/A"}</span>
            <span>{event.uniswapQuoteRequestId ?? "N/A"}</span>
            <span>{event.uniswapSwapRequestId ?? "N/A"}</span>
            <span>{event.txHash ? `${event.txHash.slice(0, 10)}...` : "N/A"}</span>
            <span>{event.agentId}</span>
          </div>
        ))}
      </div>
      {evidenceRows.length === 0 ? (
        <p className="dash-empty-inline">No execution-source evidence events yet.</p>
      ) : null}
    </article>
  );
}
