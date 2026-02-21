"use client";

import { useEffect, useState } from "react";
import { pingApi } from "@/lib/api/client";
import { RouteShell } from "@/components/dashboard/RouteShell";
import { RequireSession } from "@/components/dashboard/RequireSession";
import { useDashboardRuntime } from "@/lib/state/use-dashboard-runtime";
import { buildExplorerTxUrl } from "@/lib/api/explorer";

export function EvidenceRouteClient() {
  const runtime = useDashboardRuntime();
  const [apiHealth, setApiHealth] = useState("checking");

  useEffect(() => {
    void pingApi().then(setApiHealth).catch(() => setApiHealth("unreachable"));
  }, []);

  return (
    <RequireSession>
      <RouteShell
        title="Evidence"
        subtitle="payment mapping, failures, explorer proofs"
        apiHealth={apiHealth}
        connectionStatus={runtime.connectionStatus}
      >
        <article className="dash-panel">
          <header className="dash-panel-head">
            <h3>Payment Evidence</h3>
            <p className="pixel-text">each paid action maps to x402 lifecycle rows</p>
          </header>
          <div className="dash-table">
            <div className="dash-table-head">
              <span>time</span>
              <span>service</span>
              <span>status</span>
              <span>settlement</span>
            </div>
            {runtime.payments.slice(0, 8).map((payment) => (
              <div key={payment.id} className="dash-table-row">
                <span>{payment.createdAt}</span>
                <span>{payment.serviceUrl}</span>
                <span>{payment.status}</span>
                <span>
                  {payment.txHash ? (
                    (() => {
                      const url = buildExplorerTxUrl({ chain: "kite-testnet", txHash: payment.txHash! });
                      return url ? <a href={url}>open</a> : "unconfigured";
                    })()
                  ) : (
                    "n/a"
                  )}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="dash-panel">
          <header className="dash-panel-head">
            <h3>Failure Handling</h3>
            <p className="pixel-text">insufficient funds, invalid payment, expired session, payer mismatch</p>
          </header>
          <div className="dash-feed-list">
            {runtime.activity
              .filter((event) =>
                event.eventType.includes("failed") ||
                event.eventType.includes("error") ||
                event.detail.toLowerCase().includes("payer_mismatch"))
              .slice(0, 10)
              .map((event) => (
                <div className="dash-feed-row" key={event.id}>
                  <div>
                    <p>{event.eventType}</p>
                    <p className="pixel-text">{event.createdAt}</p>
                  </div>
                  <p className="dash-detail-line">{event.detail}</p>
                </div>
              ))}
          </div>
        </article>
      </RouteShell>
    </RequireSession>
  );
}

