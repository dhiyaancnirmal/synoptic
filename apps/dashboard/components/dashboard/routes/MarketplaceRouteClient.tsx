"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createApiClient,
  pingApi,
  type MarketplaceCatalogItem,
  type MarketplacePurchase
} from "@/lib/api/client";
import { RequireSession } from "@/components/dashboard/RequireSession";
import { RouteShell } from "@/components/dashboard/RouteShell";
import { useDashboardRuntime } from "@/lib/state/use-dashboard-runtime";

const DEFAULT_PARAMS_BY_SKU: Record<string, string> = {
  monad_lp_range_signal: JSON.stringify({ risk: 0.55, preset: "all" }, null, 2),
  monad_orderflow_imbalance: JSON.stringify({ limit: 15, windowBlocks: 800 }, null, 2),
  monad_contract_momentum: JSON.stringify({ limit: 12, minTxCount: 1 }, null, 2),
  monad_selector_heatmap: JSON.stringify({ limit: 20 }, null, 2),
  monad_launchpad_watch: JSON.stringify({ limit: 10, minAcceleration: 10 }, null, 2)
};

function parseParams(text: string): Record<string, unknown> {
  if (!text.trim()) return {};
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Params must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function truncateHash(hash?: string): string {
  if (!hash) return "—";
  if (hash.length <= 18) return hash;
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

export function MarketplaceRouteClient() {
  const runtime = useDashboardRuntime();
  const api = useMemo(() => createApiClient(), []);
  const [apiHealth, setApiHealth] = useState("checking");
  const [catalog, setCatalog] = useState<MarketplaceCatalogItem[]>([]);
  const [purchases, setPurchases] = useState<MarketplacePurchase[]>([]);
  const [selectedSku, setSelectedSku] = useState<string>("");
  const [paramsText, setParamsText] = useState("{}");
  const [previewPayload, setPreviewPayload] = useState<Record<string, unknown> | null>(null);
  const [purchasePayload, setPurchasePayload] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState<"preview" | "purchase" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedProduct = useMemo(
    () => catalog.find((item) => item.sku === selectedSku),
    [catalog, selectedSku]
  );

  const topPurchasedSku = useMemo(() => {
    const counts = new Map<string, number>();
    for (const purchase of purchases) {
      counts.set(purchase.sku, (counts.get(purchase.sku) ?? 0) + 1);
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    return sorted[0];
  }, [purchases]);

  const loadCatalog = useCallback(async () => {
    const items = await api.getMarketplaceCatalog();
    setCatalog(items);
    if (!selectedSku && items[0]) {
      setSelectedSku(items[0].sku);
      setParamsText(DEFAULT_PARAMS_BY_SKU[items[0].sku] ?? "{}");
    }
  }, [api, selectedSku]);

  const loadPurchases = useCallback(async () => {
    const rows = await api.listMarketplacePurchases(runtime.token || undefined);
    setPurchases(rows);
  }, [api, runtime.token]);

  useEffect(() => {
    void pingApi().then(setApiHealth).catch(() => setApiHealth("unreachable"));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init(): Promise<void> {
      try {
        await Promise.all([loadCatalog(), loadPurchases()]);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Failed to load marketplace");
        }
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [loadCatalog, loadPurchases]);

  useEffect(() => {
    if (!selectedSku) return;
    setParamsText(DEFAULT_PARAMS_BY_SKU[selectedSku] ?? "{}");
  }, [selectedSku]);

  async function handlePreview(): Promise<void> {
    if (!selectedSku) return;
    setBusy("preview");
    setError(null);
    try {
      const params = parseParams(paramsText);
      const result = await api.previewMarketplaceSku(selectedSku, params, runtime.token || undefined);
      setPreviewPayload(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Preview failed");
    } finally {
      setBusy(null);
    }
  }

  async function handlePurchase(): Promise<void> {
    if (!selectedSku) return;
    setBusy("purchase");
    setError(null);
    try {
      const params = parseParams(paramsText);
      const result = await api.purchaseMarketplaceSku(selectedSku, params, runtime.token || undefined);
      setPurchasePayload(result);
      await loadPurchases();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Purchase failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <RequireSession>
      <RouteShell
        title="Marketplace"
        subtitle="Monad Streams-derived data products with x402 checkout"
        apiHealth={apiHealth}
        connectionStatus={runtime.connectionStatus}
      >
        {error ? <p className="dash-empty-inline">{error}</p> : null}

        <article className="dash-panel">
          <header className="dash-panel-head">
            <h3>Marketplace Throughput</h3>
            <p className="pixel-text">purchase velocity and SKU concentration</p>
          </header>
          <div className="dash-metric-strip">
            <div>
              <p className="pixel-text">Catalog SKUs</p>
              <strong>{catalog.length}</strong>
            </div>
            <div>
              <p className="pixel-text">Purchases</p>
              <strong>{purchases.length}</strong>
            </div>
            <div>
              <p className="pixel-text">Top SKU</p>
              <strong>{topPurchasedSku ? `${topPurchasedSku[0]} (${topPurchasedSku[1]})` : "none yet"}</strong>
            </div>
            <div>
              <p className="pixel-text">Latest Purchase</p>
              <strong>{purchases[0] ? truncateHash(purchases[0].id) : "none"}</strong>
            </div>
          </div>
        </article>

        <div className="dash-two-pane">
          <article className="dash-panel">
            <header className="dash-panel-head">
              <h3>SKU Catalog</h3>
              <p className="pixel-text">richer Monad product set from streams + transforms</p>
            </header>

            <div className="dash-table">
              <div className="dash-table-head dash-table-head-6">
                <span>sku</span>
                <span>category</span>
                <span>cadence</span>
                <span>confidence</span>
                <span>price</span>
                <span>source</span>
              </div>
              {catalog.map((item) => (
                <button
                  key={item.sku}
                  className={`dash-table-row dash-table-row-6 dash-row-button ${selectedSku === item.sku ? "active" : ""}`}
                  onClick={() => setSelectedSku(item.sku)}
                >
                  <span>{item.sku}</span>
                  <span>{item.category ?? "unknown"}</span>
                  <span>{item.refreshCadence ?? "n/a"}</span>
                  <span>{item.dataConfidence ?? "n/a"}</span>
                  <span>${item.priceUsd.toFixed(2)}</span>
                  <span>{item.dataSource}</span>
                </button>
              ))}
            </div>

            {selectedProduct ? (
              <>
                <div className="dash-inline-code">
                  <p>{selectedProduct.name}</p>
                  <p>{selectedProduct.description}</p>
                </div>
                <label className="dash-json-label">
                  <span className="pixel-text">SKU Params (JSON)</span>
                  <textarea value={paramsText} onChange={(event) => setParamsText(event.target.value)} />
                </label>
                <div className="dash-action-rail">
                  <button className="dash-btn" disabled={busy !== null} onClick={() => void handlePreview()}>
                    {busy === "preview" ? "Previewing..." : "Preview"}
                  </button>
                  <button className="dash-btn" disabled={busy !== null} onClick={() => void handlePurchase()}>
                    {busy === "purchase" ? "Purchasing..." : "Purchase"}
                  </button>
                </div>
              </>
            ) : (
              <p className="dash-empty-inline">Select a SKU to configure params and purchase.</p>
            )}
          </article>

          <article className="dash-panel">
            <header className="dash-panel-head">
              <h3>Responses</h3>
              <p className="pixel-text">preview payload and latest purchase receipt</p>
            </header>

            {previewPayload ? (
              <pre className="dash-json-preview">{JSON.stringify(previewPayload, null, 2)}</pre>
            ) : (
              <p className="dash-empty-inline">Run preview to inspect sample payloads.</p>
            )}

            {purchasePayload ? (
              <pre className="dash-json-preview">{JSON.stringify(purchasePayload, null, 2)}</pre>
            ) : (
              <p className="dash-empty-inline">Purchase response will appear here.</p>
            )}
          </article>
        </div>

        <article className="dash-panel">
          <header className="dash-panel-head">
            <h3>Purchase Ledger</h3>
            <p className="pixel-text">recent x402 completions</p>
          </header>
          <div className="dash-table">
            <div className="dash-table-head dash-table-head-5">
              <span>time</span>
              <span>sku</span>
              <span>status</span>
              <span>payment</span>
              <span>result hash</span>
            </div>
            {purchases.map((purchase) => (
              <div className="dash-table-row dash-table-row-5" key={purchase.id}>
                <span>{purchase.createdAt}</span>
                <span>{purchase.sku}</span>
                <span>{purchase.status}</span>
                <span>{truncateHash(purchase.paymentId)}</span>
                <span>{truncateHash(purchase.resultHash)}</span>
              </div>
            ))}
            {purchases.length === 0 ? <p className="dash-empty-inline">No purchases yet.</p> : null}
          </div>
        </article>
      </RouteShell>
    </RequireSession>
  );
}
