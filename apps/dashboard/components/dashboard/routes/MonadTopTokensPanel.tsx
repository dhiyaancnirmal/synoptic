"use client";

import { Liveline } from "liveline";
import type { LivelinePoint } from "liveline";
import { useEffect, useMemo, useState } from "react";

interface TokenSeries {
  address: string;
  symbol: string;
  decimals: number;
  transferCount: number;
  points: LivelinePoint[];
}

interface MonadTopTokensResponse {
  chainId: number;
  latestBlock: number;
  fromBlock: number;
  generatedAt: string;
  rpcUrl: string;
  tokens: TokenSeries[];
}

function shortAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function MonadTopTokensPanel() {
  const [payload, setPayload] = useState<MonadTopTokensResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const response = await fetch("/api/monad/top-tokens", { cache: "no-store" });
        const json = (await response.json()) as MonadTopTokensResponse | { message?: string };
        if (!response.ok) {
          const fallback = `Failed to load Monad token flow (${response.status})`;
          throw new Error("message" in json && typeof json.message === "string" ? json.message : fallback);
        }
        if (!cancelled) {
          setPayload(json as MonadTopTokensResponse);
          setError(null);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Failed to load Monad token flow");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const interval = setInterval(() => {
      void load();
    }, 45_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const updatedAt = useMemo(() => {
    if (!payload) return "-";
    return new Date(payload.generatedAt).toLocaleTimeString("en-US", { hour12: false });
  }, [payload]);

  return (
    <article className="dash-panel">
      <header className="dash-panel-head">
        <h3>Monad RPC Top Tokens</h3>
        <p className="pixel-text">top 10 by transfer count (last ~100 blocks) · liveline</p>
      </header>

      {loading ? <p className="dash-empty-inline">Loading Monad testnet token flow...</p> : null}
      {!loading && error ? <p className="dash-empty-inline">{error}</p> : null}

      {payload ? (
        <>
          <div className="dash-inline-code">
            <p>
              chain {payload.chainId} · blocks {payload.fromBlock}-{payload.latestBlock} · updated{" "}
              {updatedAt}
            </p>
            <p>source: {payload.rpcUrl}</p>
          </div>

          <div className="dash-token-grid">
            {payload.tokens.map((token) => (
              <section key={token.address} className="dash-token-card">
                <div className="dash-token-head">
                  <p className="pixel-text">{token.symbol}</p>
                  <p>{token.transferCount} tx</p>
                </div>
                <div className="dash-token-subhead">{shortAddress(token.address)}</div>
                <div className="dash-token-chart">
                  <Liveline
                    data={token.points}
                    value={token.points[token.points.length - 1]?.value ?? 0}
                    color="#ec5e28"
                    theme="dark"
                    grid={false}
                    scrub={false}
                    pulse
                    badge={false}
                    fill
                    formatValue={(value) => `${value.toFixed(0)} tx`}
                  />
                </div>
              </section>
            ))}
          </div>
        </>
      ) : null}
    </article>
  );
}

