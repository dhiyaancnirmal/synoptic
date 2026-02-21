"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { pingApi } from "@/lib/api/client";
import { RouteShell } from "@/components/dashboard/RouteShell";
import { RequireSession } from "@/components/dashboard/RequireSession";
import { useDashboardRuntime } from "@/lib/state/use-dashboard-runtime";

interface ChartPoint {
  x: number;
  y: number;
}

function SparklineGraph({ data, label }: { data: ChartPoint[]; label: string }) {
  if (data.length < 2) {
    return (
      <div className="dash-liveline-placeholder">
        <p className="pixel-text">insufficient data</p>
        <p>{label}</p>
      </div>
    );
  }

  const width = 520;
  const height = 170;
  const padding = 18;
  const xRange = Math.max(data[data.length - 1]!.x - data[0]!.x, 1);
  const yValues = data.map((point) => point.y);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const yRange = Math.max(maxY - minY, 1);

  const toX = (value: number) => padding + ((value - data[0]!.x) / xRange) * (width - 2 * padding);
  const toY = (value: number) => height - padding - ((value - minY) / yRange) * (height - 2 * padding);

  const linePath = data
    .map((point, index) => `${index === 0 ? "M" : "L"} ${toX(point.x)} ${toY(point.y)}`)
    .join(" ");

  const last = data[data.length - 1]!;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="dash-liveline-svg" role="img" aria-label={label}>
      <path d={linePath} fill="none" stroke="var(--spicy-paprika)" strokeWidth="2" />
      <circle cx={toX(last.x)} cy={toY(last.y)} r="4" fill="var(--floral-white)" />
      <text x={padding} y={14} className="dash-liveline-label" fill="var(--dust-grey)">
        {label}
      </text>
      <text x={width - padding} y={14} textAnchor="end" className="dash-liveline-label" fill="var(--spicy-paprika)">
        {last.y.toFixed(2)}
      </text>
    </svg>
  );
}

function BarsGraph({ values, labels, title }: { values: number[]; labels: string[]; title: string }) {
  const width = 520;
  const height = 170;
  const padding = 20;
  const max = Math.max(...values, 1);
  const barWidth = (width - padding * 2) / Math.max(values.length, 1) - 14;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="dash-liveline-svg" role="img" aria-label={title}>
      <text x={padding} y={14} className="dash-liveline-label" fill="var(--dust-grey)">
        {title}
      </text>
      {values.map((value, index) => {
        const safeHeight = ((value / max) * (height - 60));
        const x = padding + index * (barWidth + 14) + 7;
        const y = height - padding - safeHeight;
        return (
          <g key={`${labels[index]}-${value}`}>
            <rect
              x={x}
              y={y}
              width={Math.max(barWidth, 18)}
              height={safeHeight}
              fill="color-mix(in oklab, var(--spicy-paprika) 72%, var(--charcoal-brown))"
            />
            <text
              x={x + Math.max(barWidth, 18) / 2}
              y={height - 8}
              textAnchor="middle"
              className="dash-liveline-label"
              fill="var(--dust-grey)"
            >
              {labels[index]}
            </text>
            <text
              x={x + Math.max(barWidth, 18) / 2}
              y={Math.max(26, y - 4)}
              textAnchor="middle"
              className="dash-liveline-label"
              fill="var(--floral-white)"
            >
              {value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function OverviewRouteClient() {
  const runtime = useDashboardRuntime();
  const [apiHealth, setApiHealth] = useState("checking");

  useEffect(() => {
    void pingApi().then(setApiHealth).catch(() => setApiHealth("unreachable"));
  }, []);

  const latestPayment = runtime.payments[0];
  const latestTrade = runtime.trades[0];
  const latestStream = runtime.activity.find((event) => event.eventType === "quicknode.block.received");
  const settledPayments = runtime.payments.filter((payment) => payment.status === "settled");
  const confirmedTrades = runtime.trades.filter((trade) => trade.status === "confirmed");
  const streamEvents = runtime.activity.filter((event) => event.eventType === "quicknode.block.received");
  const recentEvents = runtime.activity.slice(0, 8);
  const failures = useMemo(
    () =>
      runtime.activity.filter((event) =>
        event.eventType.includes("failed") || event.eventType.includes("error")
      ),
    [runtime.activity]
  );
  const tradeCurve = useMemo(() => {
    return runtime.trades
      .slice(0, 24)
      .reverse()
      .map((trade, index) => {
        const amount = Number(trade.amountOut) || Number(trade.amountIn) || 0;
        return { x: index + 1, y: Number.isFinite(amount) ? amount : 0 };
      })
      .filter((point) => point.y > 0);
  }, [runtime.trades]);

  const paymentBars = useMemo(() => {
    const order = ["requested", "authorized", "settled", "failed"] as const;
    const counts = new Map<string, number>();
    for (const payment of runtime.payments) {
      counts.set(payment.status, (counts.get(payment.status) ?? 0) + 1);
    }
    return {
      labels: order.map((label) => label.slice(0, 3).toUpperCase()),
      values: order.map((label) => counts.get(label) ?? 0)
    };
  }, [runtime.payments]);

  const streamCurve = useMemo(() => {
    return streamEvents
      .slice(0, 24)
      .reverse()
      .map((event, index) => {
        const block = event.detail.match(/blockNumber:(\d+)/)?.[1];
        const value = block ? Number(block) : 0;
        return { x: index + 1, y: Number.isFinite(value) ? value : 0 };
      })
      .filter((point) => point.y > 0);
  }, [streamEvents]);

  return (
    <RequireSession>
      <RouteShell
        title="Overview"
        subtitle="identity ready -> paid action -> chain proof"
        apiHealth={apiHealth}
        connectionStatus={runtime.connectionStatus}
      >
        <article className="dash-panel dash-overview-hero">
          <div>
            <p className="pixel-text">Operator Surface</p>
            <h3>Autonomous trading + payments + stream telemetry</h3>
            <p className="dash-detail-line">
              Identity, x402, execution, and ingestion status consolidated into one control grid.
            </p>
          </div>
          <div className="dash-overview-hero-kpis">
            <div className="dash-kpi-card">
              <p className="pixel-text">agents</p>
              <h3>{runtime.agents.length}</h3>
            </div>
            <div className="dash-kpi-card">
              <p className="pixel-text">settled payments</p>
              <h3>{settledPayments.length}</h3>
            </div>
            <div className="dash-kpi-card">
              <p className="pixel-text">confirmed trades</p>
              <h3>{confirmedTrades.length}</h3>
            </div>
            <div className="dash-kpi-card">
              <p className="pixel-text">stream events</p>
              <h3>{streamEvents.length}</h3>
            </div>
          </div>
        </article>

        <div className="dash-overview-split">
          <div className="dash-overview-stack">
            <article className="dash-panel">
              <header className="dash-panel-head">
                <h3>Identity Readiness</h3>
                <p className="pixel-text">owner + session posture</p>
              </header>
              <p className="dash-detail-line">
                Agent: {runtime.agents[0]?.id ?? "n/a"} | Owner: {runtime.agents[0]?.eoaAddress ?? "n/a"}
              </p>
              <p className="dash-detail-line">
                Session: {runtime.token ? "active" : "missing"} | Realtime: {runtime.connectionStatus}
              </p>
            </article>

            <article className="dash-panel">
              <header className="dash-panel-head">
                <h3>Latest Paid Action</h3>
                <p className="pixel-text">challenge {"->"} settle status</p>
              </header>
              <p className="dash-detail-line">
                Payment: {latestPayment?.status ?? "none"} | Amount: {latestPayment?.amountUsd ?? "0"}
              </p>
              <p className="dash-detail-line">Service: {latestPayment?.serviceUrl ?? "n/a"}</p>
            </article>

            <article className="dash-panel">
              <header className="dash-panel-head">
                <h3>Execution Snapshot</h3>
                <p className="pixel-text">trade + stream + failure queue</p>
              </header>
              <p className="dash-detail-line">
                Trade: {latestTrade?.status ?? "none"} | Pair: {latestTrade?.pair ?? "n/a"}
              </p>
              <p className="dash-detail-line">
                Stream: {latestStream ? latestStream.createdAt : "no quicknode events"}
              </p>
              <p className="dash-detail-line">Failures: {failures.length}</p>
            </article>
          </div>

          <article className="dash-panel">
            <header className="dash-panel-head">
              <h3>Recent Activity Rail</h3>
              <p className="pixel-text">event stream and route jumps</p>
            </header>

            <div className="dash-feed-list">
              {recentEvents.length > 0 ? (
                recentEvents.map((event) => (
                  <div key={event.id} className="dash-feed-row">
                    <p className="pixel-text">{event.createdAt}</p>
                    <p className="dash-feed-title">{event.eventType}</p>
                    <p>{event.detail}</p>
                  </div>
                ))
              ) : (
                <p className="dash-empty-inline">No activity yet.</p>
              )}
            </div>

            <div className="dash-overview-actions">
              <Link href="/trading" className="dash-filter">
                Open Trading
              </Link>
              <Link href="/marketplace" className="dash-filter">
                Open Marketplace
              </Link>
              <Link href="/streams" className="dash-filter">
                Open Streams
              </Link>
              <Link href="/payments" className="dash-filter">
                Open Payments
              </Link>
            </div>
          </article>
        </div>

        <div className="dash-overview-charts">
          <article className="dash-panel">
            <header className="dash-panel-head">
              <h3>Trade Output Trend</h3>
              <p className="pixel-text">amount out over recent executions</p>
            </header>
            <div className="dash-liveline-container">
              <SparklineGraph data={tradeCurve} label="trade output trend" />
            </div>
          </article>

          <article className="dash-panel">
            <header className="dash-panel-head">
              <h3>Payment Lifecycle Mix</h3>
              <p className="pixel-text">requested / authorized / settled / failed</p>
            </header>
            <div className="dash-liveline-container">
              <BarsGraph values={paymentBars.values} labels={paymentBars.labels} title="payment status mix" />
            </div>
          </article>

          <article className="dash-panel">
            <header className="dash-panel-head">
              <h3>Stream Block Climb</h3>
              <p className="pixel-text">quicknode blockNumber progression</p>
            </header>
            <div className="dash-liveline-container">
              <SparklineGraph data={streamCurve} label="stream block climb" />
            </div>
          </article>
        </div>
      </RouteShell>
    </RequireSession>
  );
}
