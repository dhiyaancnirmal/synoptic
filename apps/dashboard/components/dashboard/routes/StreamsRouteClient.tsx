"use client";

import { useEffect, useMemo, useState } from "react";
import { pingApi } from "@/lib/api/client";
import { RequireSession } from "@/components/dashboard/RequireSession";
import { RouteShell } from "@/components/dashboard/RouteShell";
import { useDashboardRuntime } from "@/lib/state/use-dashboard-runtime";
import type { ActivityVM } from "@/lib/mappers";

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
        timeSinceLastMs: Infinity,
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
      timeSinceLastMs,
    };
  }, [activity]);
}

function useLivelineData(activity: ActivityVM[]): LivelinePoint[] {
  return useMemo(() => {
    const quickNodeEvents = activity
      .filter((event) => event.eventType === "quicknode.block.received")
      .slice(0, 50)
      .reverse();

    return quickNodeEvents.map((event) => {
      const blockNumber = event.detail.match(/blockNumber:(\d+)/)?.[1];
      return {
        time: Date.parse(event.createdAt),
        blockNumber: blockNumber ? parseInt(blockNumber, 10) : 0,
      };
    });
  }, [activity]);
}

function formatTimeSince(ms: number): string {
  if (!isFinite(ms)) return "never";
  if (ms < 1000) return `${ms}ms ago`;
  if (ms < 60000) return `${Math.floor(ms / 1000)}s ago`;
  return `${Math.floor(ms / 60000)}m ago`;
}

function getBlockNumber(event: ActivityVM): string | null {
  const match = event.detail.match(/blockNumber:(\d+)/);
  return match ? match[1] : null;
}

export function StreamsRouteClient() {
  const runtime = useDashboardRuntime();
  const [apiHealth, setApiHealth] = useState("checking");

  useEffect(() => {
    void pingApi()
      .then(setApiHealth)
      .catch(() => setApiHealth("unreachable"));
  }, []);

  const streamStatus = useQuickNodeStreamStatus(runtime.activity);
  const livelineData = useLivelineData(runtime.activity);

  return (
    <RequireSession>
      <RouteShell
        title="Streams"
        subtitle="chain data ingestion and block stream"
        apiHealth={apiHealth}
        connectionStatus={runtime.connectionStatus}
      >
        {runtime.error ? <p className="dash-empty-inline">{runtime.error}</p> : null}

        <section className="dash-route-stack">
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
                    runtime.connectionStatus === "connected"
                      ? "dash-stream-healthy"
                      : "dash-stream-degraded"
                  }
                >
                  {runtime.connectionStatus}
                </h3>
                <p>realtime</p>
              </div>
              <div className="dash-kpi-card">
                <p className="pixel-text">Latest Block</p>
                <h3>
                  {streamStatus.lastEvent
                    ? getBlockNumber(streamStatus.lastEvent) || "N/A"
                    : "N/A"}
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
              {runtime.activity
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
              {runtime.activity.filter((e) => e.eventType === "quicknode.block.received")
                .length === 0 && (
                <p className="dash-empty-inline">No QuickNode events received yet.</p>
              )}
            </div>
          </article>
        </section>
      </RouteShell>
    </RequireSession>
  );
}
