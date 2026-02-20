"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  clearSessionToken,
  ensureDashboardSessionToken,
  getApiMode,
  getSessionToken,
  setSessionToken
} from "@/lib/api/client";

export default function LoginPage() {
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("Create or provide a session token for dashboard routes.");
  const [tokenInput, setTokenInput] = useState("");
  const [activeTokenDetected, setActiveTokenDetected] = useState(false);
  const apiMode = getApiMode();

  useEffect(() => {
    setActiveTokenDetected(Boolean(getSessionToken()));
  }, []);

  async function bootstrap(): Promise<void> {
    setStatus("loading");
    try {
      await ensureDashboardSessionToken();
      setStatus("ok");
      setMessage("Session token created for this browser session.");
      setActiveTokenDetected(true);
    } catch (cause) {
      setStatus("error");
      setMessage(cause instanceof Error ? cause.message : "Failed to initialize session");
    }
  }

  function reset(): void {
    clearSessionToken();
    setTokenInput("");
    setStatus("idle");
    setMessage("Session cleared.");
    setActiveTokenDetected(false);
  }

  function saveManualToken(): void {
    try {
      setSessionToken(tokenInput);
      setStatus("ok");
      setMessage("Session token saved for this browser session.");
      setActiveTokenDetected(true);
    } catch (cause) {
      setStatus("error");
      setMessage(cause instanceof Error ? cause.message : "Failed to save session token");
    }
  }

  return (
    <main className="dash-shell">
      <section className="dash-main">
        <article className="dash-panel">
          <header className="dash-panel-head">
            <h3>Login</h3>
            <p className="pixel-text">phased auth hardening</p>
          </header>
          <p className="dash-detail-line">
            mode: auth=passport api={apiMode}
          </p>
          {activeTokenDetected ? <p className="dash-detail-line">active session token detected.</p> : null}
          <p className="dash-empty-inline">{message}</p>
          <div className="dash-filter-row">
            <button type="button" className="dash-filter active" onClick={() => void bootstrap()}>
              {status === "loading" ? "connecting wallet..." : "connect wallet (siwe)"}
            </button>
            <button type="button" className="dash-filter" onClick={reset}>
              clear session
            </button>
            <Link href="/agents" className="dash-filter">
              open agents
            </Link>
          </div>
          <div className="dash-filter-row">
            <input
              className="dash-search-input"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder="paste bearer token"
              aria-label="manual bearer token"
            />
            <button type="button" className="dash-filter" onClick={saveManualToken}>
              save token
            </button>
          </div>
        </article>
      </section>
    </main>
  );
}
