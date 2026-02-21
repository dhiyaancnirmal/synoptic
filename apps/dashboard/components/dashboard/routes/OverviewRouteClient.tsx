"use client";

import { useEffect, useMemo, useState } from "react";
import { pingApi } from "@/lib/api/client";
import { RouteShell } from "@/components/dashboard/RouteShell";
import { RequireSession } from "@/components/dashboard/RequireSession";
import { useDashboardRuntime } from "@/lib/state/use-dashboard-runtime";

export function OverviewRouteClient() {
  const runtime = useDashboardRuntime();
  const [apiHealth, setApiHealth] = useState("checking");

  useEffect(() => {
    void pingApi().then(setApiHealth).catch(() => setApiHealth("unreachable"));
  }, []);

  const latestPayment = runtime.payments[0];
  const latestTrade = runtime.trades[0];
  const latestStream = runtime.activity.find((event) => event.eventType === "quicknode.block.received");
  const failures = useMemo(
    () =>
      runtime.activity.filter((event) =>
        event.eventType.includes("failed") || event.eventType.includes("error")
      ),
    [runtime.activity]
  );

  return (
    <RequireSession>
      <RouteShell
        title="Overview"
        subtitle="identity ready -> paid action -> chain proof"
        apiHealth={apiHealth}
        connectionStatus={runtime.connectionStatus}
      >
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
      </RouteShell>
    </RequireSession>
  );
}
