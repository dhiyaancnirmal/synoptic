import type { OrderRecord } from "@synoptic/types/orders";

interface TradingPanelProps {
  orders: OrderRecord[];
}

export function TradingPanel({ orders }: TradingPanelProps) {
  const spotOrders = orders.filter((order) => order.venueType === "SPOT");
  const latest = orders.slice(0, 10);

  return (
    <article className="dash-panel">
      <header className="dash-panel-head">
        <h3>Trading</h3>
        <p className="pixel-text">execution surface</p>
      </header>
      <div className="dash-trading-cards">
        <div>
          <p className="pixel-text">Spot</p>
          <h4>Live</h4>
          <p>{spotOrders.length} orders tracked</p>
        </div>
        <div>
          <p className="pixel-text">Perps</p>
          <h4>Paper mode</h4>
          <p>Placeholder only in this bounty cycle (not live execution)</p>
        </div>
        <div>
          <p className="pixel-text">Prediction</p>
          <h4>Paper mode</h4>
          <p>Placeholder only in this bounty cycle (not live execution)</p>
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
    </article>
  );
}
