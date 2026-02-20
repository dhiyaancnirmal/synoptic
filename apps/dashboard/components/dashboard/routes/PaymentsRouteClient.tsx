"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createApiClient, pingApi } from "@/lib/api/client";
import { buildExplorerTxUrl } from "@/lib/api/explorer";
import { RequireSession } from "@/components/dashboard/RequireSession";
import { RouteShell } from "@/components/dashboard/RouteShell";
import { useDashboardRuntime } from "@/lib/state/use-dashboard-runtime";

export function PaymentsRouteClient() {
  const runtime = useDashboardRuntime();
  const searchParams = useSearchParams();
  const api = useMemo(() => createApiClient(), []);
  const [apiHealth, setApiHealth] = useState("checking");
  const [pair, setPair] = useState("ETH/USDT");
  const [xPayment, setXPayment] = useState("");
  const [oracleState, setOracleState] = useState<{
    status: "idle" | "loading" | "challenge" | "success" | "error";
    message?: string;
    challenge?: Record<string, unknown>;
    payload?: Record<string, unknown>;
  }>({ status: "idle" });

  useEffect(() => {
    void pingApi().then(setApiHealth).catch(() => setApiHealth("unreachable"));
  }, []);

  const selectedPaymentId = searchParams.get("paymentId");
  const selected =
    (selectedPaymentId
      ? runtime.payments.find((payment) => payment.id === selectedPaymentId || payment.settlementId === selectedPaymentId)
      : undefined) ?? runtime.payments[0];
  const steps = ["requested", "authorized", "settled"] as const;
  const scopedTimeline = selected
    ? runtime.activity
        .filter((event) => event.paymentId === selected.id || event.paymentId === selected.settlementId)
        .filter((event) => event.eventType.startsWith("payment."))
    : [];

  const timelineStatusMap = new Map<string, string>();
  for (const event of scopedTimeline) {
    const step = event.eventType.split(".")[1];
    if (step) timelineStatusMap.set(step, event.detail);
  }

  async function runOracleRequest(): Promise<void> {
    setOracleState({ status: "loading" });
    try {
      const response = await api.getOraclePrice(pair, xPayment || undefined, runtime.token || undefined);
      if (!response.ok && response.status === 402) {
        setOracleState({
          status: "challenge",
          message: "Oracle returned 402 challenge. Provide X-PAYMENT and retry.",
          challenge: response.challenge
        });
        return;
      }

      if (!response.ok) {
        setOracleState({
          status: "error",
          message: `Oracle request failed (${response.status})`
        });
        return;
      }

      setOracleState({
        status: "success",
        message: "Oracle request settled and returned payload.",
        payload: response.payload
      });
    } catch (cause) {
      setOracleState({
        status: "error",
        message: cause instanceof Error ? cause.message : "Oracle request failed"
      });
    }
  }

  return (
    <RequireSession>
      <RouteShell
        title="Payments"
        subtitle="x402 lifecycle and settlement evidence"
        apiHealth={apiHealth}
        connectionStatus={runtime.connectionStatus}
      >
        <article className="dash-panel">
          <header className="dash-panel-head">
            <h3>Payment Lifecycle</h3>
            <p className="pixel-text">requested {"->"} authorized {"->"} settled</p>
          </header>
          {selected ? (
            <ol className="dash-flow-rail">
              {steps.map((step, index) => {
                const active =
                  selected.status === step ||
                  (selected.status === "settled" && (step === "requested" || step === "authorized"));
                const failed = selected.status === "failed";
                const detail = timelineStatusMap.get(step);
                return (
                  <li key={step}>
                    <span className="pixel-text">0{index + 1}</span>
                    <p>{step}</p>
                    <span className={`dash-status ${failed ? "error" : active ? "success" : "challenge"}`}>
                      {failed && step === "settled" ? "failed" : active ? "done" : "pending"}
                    </span>
                    {detail ? <span className="dash-detail-line">{detail}</span> : null}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="dash-empty-inline">No payment activity yet.</p>
          )}
          {selected ? (
            <p className="dash-detail-line">
              selected: {selected.id} · agent {selected.agentId} · amount ${selected.amountUsd}
              {selected.txHash
                ? (() => {
                    const txUrl = buildExplorerTxUrl({ chain: "kite-testnet", txHash: selected.txHash });
                    if (!txUrl) return " · settlement tx unavailable (configure kite explorer)";
                    return (
                      <>
                        {" "}
                        ·{" "}
                        <a href={txUrl} target="_blank" rel="noreferrer">
                          settlement proof
                        </a>
                      </>
                    );
                  })()
                : ""}
            </p>
          ) : null}
        </article>

        <article className="dash-panel">
          <header className="dash-panel-head">
            <h3>Oracle Challenge / Retry</h3>
            <p className="pixel-text">deterministic 402 test path</p>
          </header>
          <div className="dash-filter-row">
            <input
              className="dash-search-input"
              value={pair}
              onChange={(event) => setPair(event.target.value)}
              aria-label="trading pair"
              placeholder="ETH/USDT"
            />
            <input
              className="dash-search-input"
              value={xPayment}
              onChange={(event) => setXPayment(event.target.value)}
              aria-label="x-payment"
              placeholder="optional X-PAYMENT for retry"
            />
            <button className="dash-filter active" onClick={() => void runOracleRequest()} type="button">
              {oracleState.status === "loading" ? "requesting..." : "request /oracle/price"}
            </button>
          </div>
          {oracleState.message ? <p className="dash-empty-inline">{oracleState.message}</p> : null}
          {oracleState.challenge ? (
            <p className="dash-detail-line">challenge: {JSON.stringify(oracleState.challenge)}</p>
          ) : null}
          {oracleState.payload ? <p className="dash-detail-line">payload: {JSON.stringify(oracleState.payload)}</p> : null}
        </article>

        <article className="dash-panel">
          <header className="dash-panel-head">
            <h3>Payments Table</h3>
            <p className="pixel-text">live updates</p>
          </header>
          <div className="dash-table">
            <div className="dash-table-head">
              <span>time</span>
              <span>agent</span>
              <span>service</span>
              <span>amount</span>
              <span>settlement</span>
              <span>tx</span>
              <span>status</span>
            </div>
            {runtime.payments.map((row) => (
              <div key={row.id} className={`dash-table-row ${selected?.id === row.id ? "active" : ""}`}>
                <span>{row.createdAt}</span>
                <span>{row.agentId}</span>
                <span>{row.serviceUrl}</span>
                <span>{row.amountUsd}</span>
                <span>
                  {row.settlementId ? (
                    <Link href={`/activity?paymentId=${encodeURIComponent(row.settlementId)}`}>{row.settlementId}</Link>
                  ) : (
                    "N/A"
                  )}
                </span>
                <span>
                  {row.txHash ? (
                    (() => {
                      const txUrl = buildExplorerTxUrl({ chain: "kite-testnet", txHash: row.txHash });
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
                <span className={`dash-status ${row.status === "failed" ? "error" : row.status === "settled" ? "success" : "challenge"}`}>
                  {row.status}
                </span>
              </div>
            ))}
          </div>
        </article>
      </RouteShell>
    </RequireSession>
  );
}
