"use client";

import { useCallback, useEffect, useState } from "react";
import { pingApi } from "@/lib/api/client";
import { RequireSession } from "@/components/dashboard/RequireSession";
import { RouteShell } from "@/components/dashboard/RouteShell";
import { useDashboardRuntime } from "@/lib/state/use-dashboard-runtime";

const API_URL =
  process.env.NEXT_PUBLIC_AGENT_SERVER_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3001";

interface CatalogItem {
  sku: string;
  name: string;
  description: string;
  priceUsd: number;
  dataSource: string;
}

interface Purchase {
  id: string;
  sku: string;
  paymentId?: string;
  status: string;
  resultHash?: string;
  createdAt: string;
}

interface PurchaseResult {
  purchaseId: string;
  sku: string;
  paymentId?: string;
  settlementTxHash?: string;
  data: unknown[];
  resultHash: string;
  timestamp: string;
}

function formatPrice(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

function truncateHash(hash?: string): string {
  if (!hash) return "—";
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

export function MarketplaceRouteClient() {
  const runtime = useDashboardRuntime();
  const [apiHealth, setApiHealth] = useState("checking");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [lastResult, setLastResult] = useState<PurchaseResult | null>(null);
  const [buyingSku, setBuyingSku] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, unknown[]>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void pingApi()
      .then(setApiHealth)
      .catch(() => setApiHealth("unreachable"));
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/marketplace/catalog`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { catalog: CatalogItem[] }) => setCatalog(data.catalog ?? []))
      .catch(() => setError("Failed to load catalog"));
  }, []);

  const loadPurchases = useCallback(async () => {
    try {
      const token =
        typeof window !== "undefined"
          ? window.sessionStorage.getItem("synoptic.dashboard.session.token") ?? ""
          : "";
      const res = await fetch(`${API_URL}/api/marketplace/purchases`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
        cache: "no-store"
      });
      if (res.ok) {
        const data = (await res.json()) as { purchases: Purchase[] };
        setPurchases(data.purchases ?? []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadPurchases();
  }, [loadPurchases]);

  const handlePreview = useCallback(
    async (sku: string) => {
      try {
        const res = await fetch(`${API_URL}/marketplace/products/${sku}/preview`, {
          cache: "no-store"
        });
        const data = (await res.json()) as { data: unknown[] };
        setPreviewData((prev) => ({ ...prev, [sku]: data.data ?? [] }));
      } catch {
        setError(`Failed to load preview for ${sku}`);
      }
    },
    []
  );

  const handleBuy = useCallback(
    async (sku: string) => {
      setBuyingSku(sku);
      setError(null);
      setLastResult(null);
      try {
        // Step 1: POST without payment → get 402 challenge
        const res1 = await fetch(`${API_URL}/marketplace/products/${sku}/purchase`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          cache: "no-store"
        });

        if (res1.status === 402) {
          const challenge = await res1.json();
          // Step 2: Re-POST with x-payment header containing the challenge as payment proof
          const xPayment = JSON.stringify({
            paymentPayload: {
              scheme: challenge.scheme ?? "exact",
              network: challenge.network ?? "eip155:2368",
              authorization: {
                payer: "0xdemo_dashboard_user",
                payee: challenge.payTo,
                amount: challenge.maxAmountRequired
              },
              signature: "0xdemo_sig"
            },
            paymentRequirements: challenge
          });

          const res2 = await fetch(`${API_URL}/marketplace/products/${sku}/purchase`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-payment": xPayment,
              "x-payment-request-id": challenge.paymentRequestId ?? ""
            },
            cache: "no-store"
          });

          if (res2.ok) {
            const result = (await res2.json()) as PurchaseResult;
            setLastResult(result);
            void loadPurchases();
          } else {
            const err = (await res2.json().catch(() => ({}))) as { message?: string };
            setError(err.message ?? `Purchase failed (${res2.status})`);
          }
        } else if (res1.ok) {
          const result = (await res1.json()) as PurchaseResult;
          setLastResult(result);
          void loadPurchases();
        } else {
          setError(`Unexpected response: ${res1.status}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Purchase failed");
      } finally {
        setBuyingSku(null);
      }
    },
    [loadPurchases]
  );

  return (
    <RequireSession>
      <RouteShell
        title="Marketplace"
        subtitle="derived data products powered by QuickNode Streams"
        apiHealth={apiHealth}
        connectionStatus={runtime.connectionStatus}
      >
        {error ? <p className="dash-empty-inline" style={{ color: "var(--spicy-paprika)" }}>{error}</p> : null}

        <section className="dash-route-stack">
          {/* Product Catalog */}
          <article className="dash-panel">
            <header className="dash-panel-head">
              <h3>Product Catalog</h3>
              <p className="pixel-text">x402-gated data products from Monad streams</p>
            </header>

            <div className="dash-kpi-grid">
              {catalog.map((item) => (
                <div key={item.sku} className="dash-kpi-card">
                  <p className="pixel-text">{item.dataSource}</p>
                  <h3>{item.name}</h3>
                  <p style={{ fontSize: "0.85rem", marginBottom: "0.5rem" }}>{item.description}</p>
                  <p style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--spicy-paprika)" }}>
                    {formatPrice(item.priceUsd)}
                  </p>
                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                    <button
                      className="dash-btn"
                      onClick={() => void handlePreview(item.sku)}
                    >
                      Preview
                    </button>
                    <button
                      className="dash-btn"
                      disabled={buyingSku !== null}
                      onClick={() => void handleBuy(item.sku)}
                    >
                      {buyingSku === item.sku ? "Buying..." : "Buy"}
                    </button>
                  </div>
                  {previewData[item.sku] && (
                    <pre
                      style={{
                        marginTop: "0.5rem",
                        fontSize: "0.7rem",
                        maxHeight: "120px",
                        overflow: "auto",
                        background: "rgba(0,0,0,0.2)",
                        padding: "0.5rem",
                        borderRadius: "4px"
                      }}
                    >
                      {JSON.stringify(previewData[item.sku], null, 2)}
                    </pre>
                  )}
                </div>
              ))}
              {catalog.length === 0 && (
                <p className="dash-empty-inline">Loading catalog...</p>
              )}
            </div>
          </article>

          {/* Last Purchase Result */}
          {lastResult && (
            <article className="dash-panel">
              <header className="dash-panel-head">
                <h3>Purchase Result</h3>
                <p className="pixel-text">latest x402 purchase receipt</p>
              </header>

              <div className="dash-kpi-grid">
                <div className="dash-kpi-card">
                  <p className="pixel-text">Purchase ID</p>
                  <h3 style={{ fontSize: "0.9rem", wordBreak: "break-all" }}>
                    {truncateHash(lastResult.purchaseId)}
                  </h3>
                </div>
                <div className="dash-kpi-card">
                  <p className="pixel-text">SKU</p>
                  <h3>{lastResult.sku}</h3>
                </div>
                <div className="dash-kpi-card">
                  <p className="pixel-text">Payment ID</p>
                  <h3 style={{ fontSize: "0.9rem" }}>{truncateHash(lastResult.paymentId)}</h3>
                </div>
                <div className="dash-kpi-card">
                  <p className="pixel-text">Settlement Tx</p>
                  <h3 style={{ fontSize: "0.9rem" }}>{truncateHash(lastResult.settlementTxHash)}</h3>
                </div>
              </div>

              <div style={{ padding: "1rem" }}>
                <p className="pixel-text" style={{ marginBottom: "0.25rem" }}>
                  Result Hash: {lastResult.resultHash}
                </p>
                <p className="pixel-text" style={{ marginBottom: "0.5rem" }}>
                  Records: {lastResult.data.length}
                </p>
                <pre
                  style={{
                    fontSize: "0.7rem",
                    maxHeight: "200px",
                    overflow: "auto",
                    background: "rgba(0,0,0,0.2)",
                    padding: "0.75rem",
                    borderRadius: "4px"
                  }}
                >
                  {JSON.stringify(lastResult.data.slice(0, 5), null, 2)}
                </pre>
              </div>
            </article>
          )}

          {/* Purchase History */}
          <article className="dash-panel">
            <header className="dash-panel-head">
              <h3>Purchase History</h3>
              <p className="pixel-text">past marketplace purchases</p>
            </header>

            <div className="dash-feed-list">
              {purchases.map((p) => (
                <div key={p.id} className="dash-feed-row">
                  <p className="pixel-text">{p.createdAt}</p>
                  <p className="dash-feed-title">{p.sku}</p>
                  <p>Status: {p.status}</p>
                  <p className="pixel-text">
                    Payment: {truncateHash(p.paymentId)} | Hash: {truncateHash(p.resultHash)}
                  </p>
                </div>
              ))}
              {purchases.length === 0 && (
                <p className="dash-empty-inline">No purchases yet. Buy a data product above.</p>
              )}
            </div>
          </article>
        </section>
      </RouteShell>
    </RequireSession>
  );
}
