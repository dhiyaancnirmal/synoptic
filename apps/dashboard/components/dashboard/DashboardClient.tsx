"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentRecord } from "@synoptic/types/agent";
import type { OrderRecord, OrderRejectionReason } from "@synoptic/types/orders";
import type { SynopticEventEnvelope } from "@synoptic/types/events";
import type { HealthResponse } from "@synoptic/types/rest";
import type { CatalogProductView } from "@/lib/api";
import {
  decodeAgentIdFromToken,
  ensureDashboardToken,
  fetchAgents,
  fetchEvents,
  fetchHealth,
  fetchOrder,
  searchCatalog
} from "@/lib/api";
import { AgentsTable } from "./AgentsTable";
import { CatalogPanel } from "./CatalogPanel";
import { FailureBuckets } from "./FailureBuckets";
import { KpiCards } from "./KpiCards";
import { PanelState } from "./PanelState";
import { PaymentFlowRail } from "./PaymentFlowRail";
import { PaymentsTable } from "./PaymentsTable";
import { SidebarNav } from "./SidebarNav";
import { TradingPanel } from "./TradingPanel";
import type {
  DashboardDataModel,
  DashboardKpiModel,
  DashboardTab,
  FailureBucketModel,
  FeedFilter,
  PaymentRowModel,
  UnifiedFeedItem
} from "./types";
import { mapVenueToFilter } from "./types";
import { UnifiedFeed } from "./UnifiedFeed";

type PanelStateType = "loading" | "ready" | "empty" | "error";

interface PanelMeta {
  state: PanelStateType;
  message?: string;
}

const initialData: DashboardDataModel = {
  agents: [],
  events: [],
  ordersById: {},
  paymentRows: [],
  failures: [],
  kpis: []
};

interface DashboardClientProps {
  explorerUrl: string;
}

const dtf = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

function formatTs(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return dtf.format(date);
}

function hoursAgo(hours: number): number {
  return Date.now() - hours * 60 * 60 * 1000;
}

function inLast24h(timestamp: string): boolean {
  const ms = new Date(timestamp).getTime();
  if (Number.isNaN(ms)) return false;
  return ms >= hoursAgo(24);
}

function mapFeed(
  events: SynopticEventEnvelope[],
  ordersById: Record<string, OrderRecord>
): UnifiedFeedItem[] {
  return events.map((event) => {
    const metadata = event.metadata ?? {};
    const orderId = typeof metadata.orderId === "string" ? metadata.orderId : undefined;
    const order = orderId ? ordersById[orderId] : undefined;
    const reasonRaw =
      typeof metadata.reason === "string" ? metadata.reason : order?.rejectionReason;
    const reason = isRejectionReason(reasonRaw) ? reasonRaw : undefined;
    const route = typeof metadata.route === "string" ? metadata.route : "N/A";
    const settlementId = typeof metadata.settlementId === "string" ? metadata.settlementId : "N/A";
    const txHash = typeof metadata.txHash === "string" ? metadata.txHash : undefined;

    let domain: FeedFilter = "all";
    if (event.eventName.startsWith("x402.")) {
      domain = "payment";
    } else if (event.eventName === "trade.rejected" || event.eventName === "risk.limit.hit") {
      domain = "failure";
    } else if (event.eventName === "trade.executed") {
      domain = order ? mapVenueToFilter(order.venueType) : "spot";
    } else if (
      typeof metadata.domain === "string" &&
      metadata.domain.toLowerCase() === "ecommerce"
    ) {
      domain = "ecommerce";
    }

    const detail = [
      route !== "N/A" ? `route ${route}` : "",
      settlementId !== "N/A" ? `settlement ${settlementId}` : "",
      reason ? `reason ${reason}` : ""
    ]
      .filter(Boolean)
      .join(" ");

    return {
      id: event.eventId,
      timestampRaw: event.timestamp,
      timestamp: formatTs(event.timestamp),
      eventName: event.eventName,
      status: event.status,
      agentId: event.agentId,
      domain,
      detail: detail.length > 0 ? detail : "No metadata details",
      reason,
      orderId,
      route,
      settlementId: settlementId !== "N/A" ? settlementId : undefined,
      txHash
    };
  });
}

function mapPayments(events: SynopticEventEnvelope[]): PaymentRowModel[] {
  return events
    .filter(
      (event) =>
        event.eventName === "x402.challenge.issued" || event.eventName === "x402.payment.settled"
    )
    .map((event) => {
      const metadata = event.metadata ?? {};
      return {
        id: event.eventId,
        timestampRaw: event.timestamp,
        timestamp: formatTs(event.timestamp),
        agentId: event.agentId,
        route: typeof metadata.route === "string" ? metadata.route : "N/A",
        amount: process.env.NEXT_PUBLIC_X402_AMOUNT ?? "N/A",
        asset: process.env.NEXT_PUBLIC_SETTLEMENT_ASSET ?? "N/A",
        network: process.env.NEXT_PUBLIC_KITE_CHAIN_ID ?? "2368",
        settlementId: typeof metadata.settlementId === "string" ? metadata.settlementId : "N/A",
        txHash: typeof metadata.txHash === "string" ? metadata.txHash : undefined,
        status:
          event.eventName === "x402.challenge.issued"
            ? "challenge"
            : event.status === "SUCCESS"
              ? "success"
              : "error"
      };
    });
}

function buildKpis(
  agents: AgentRecord[],
  feed: UnifiedFeedItem[],
  payments: PaymentRowModel[]
): DashboardKpiModel[] {
  const activeAgents = agents.filter((agent) => agent.status === "ACTIVE").length;
  const paid24h = feed.filter(
    (event) => event.domain === "payment" && inLast24h(event.timestampRaw)
  ).length;
  const settled24h = payments.filter(
    (row) => row.status === "success" && inLast24h(row.timestampRaw)
  ).length;
  const failures24h = feed.filter(
    (event) => event.status === "ERROR" && inLast24h(event.timestampRaw)
  ).length;

  return [
    { label: "Active agents", value: String(activeAgents), hint: "agent runtime status" },
    { label: "Paid actions 24h", value: String(paid24h), hint: "x402 challenge and settle events" },
    {
      label: "Settled payments 24h",
      value: String(settled24h),
      hint: "x402.payment.settled success"
    },
    { label: "Failed actions 24h", value: String(failures24h), hint: "trade or payment failures" }
  ];
}

function buildFailures(feed: UnifiedFeedItem[]): FailureBucketModel[] {
  const map = new Map<OrderRejectionReason, FailureBucketModel>();
  for (const item of feed) {
    if (!item.reason) continue;
    const existing = map.get(item.reason);
    const action = suggestionForReason(item.reason);
    if (!existing) {
      map.set(item.reason, {
        reason: item.reason,
        count: 1,
        lastOccurrence: item.timestamp,
        affectedAgent: item.agentId,
        action
      });
      continue;
    }
    existing.count += 1;
    existing.lastOccurrence = item.timestamp;
    existing.affectedAgent = item.agentId;
  }
  return Array.from(map.values());
}

function suggestionForReason(reason: OrderRejectionReason): string {
  if (reason === "INSUFFICIENT_FUNDS") return "Fund vault and retry with lower notional.";
  if (reason === "INVALID_PAYMENT") return "Regenerate X-PAYMENT and verify signature payload.";
  if (reason === "FACILITATOR_UNAVAILABLE") return "Retry on facilitator recovery window.";
  if (reason === "RISK_LIMIT") return "Adjust per-tx or daily rule after operator review.";
  return "Validate request payload and quote inputs.";
}

function isRejectionReason(value: string | undefined): value is OrderRejectionReason {
  return (
    value === "INSUFFICIENT_FUNDS" ||
    value === "INVALID_PAYMENT" ||
    value === "FACILITATOR_UNAVAILABLE" ||
    value === "RISK_LIMIT" ||
    value === "INVALID_REQUEST"
  );
}

export function DashboardClient({ explorerUrl }: DashboardClientProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [apiHealth, setApiHealth] = useState("checking");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [catalogProducts, setCatalogProducts] = useState<CatalogProductView[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | undefined>(undefined);
  const [token, setToken] = useState("");
  const [panel, setPanel] = useState<PanelMeta>({ state: "loading" });
  const [data, setData] = useState<DashboardDataModel>(initialData);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setPanel({ state: "loading" });
      try {
        const dashboardToken = await ensureDashboardToken();
        if (!cancelled) {
          setToken(dashboardToken);
        }
        const tokenAgentId = decodeAgentIdFromToken(dashboardToken);

        const healthResponse = await fetchHealth();
        if (!cancelled) {
          setHealth(healthResponse);
          setApiHealth(healthResponse.status === "ok" ? "ok" : healthResponse.status);
        }

        const agents = await fetchAgents(dashboardToken);
        const events = tokenAgentId ? await fetchEvents(tokenAgentId, dashboardToken) : [];

        const orderIds = Array.from(
          new Set(
            events
              .map((event) => {
                const value = event.metadata?.orderId;
                return typeof value === "string" ? value : null;
              })
              .filter((value): value is string => Boolean(value))
          )
        );

        const orderEntries = await Promise.allSettled(
          orderIds.map(async (orderId) => {
            const order = await fetchOrder(orderId, dashboardToken);
            return [orderId, order] as const;
          })
        );

        const ordersById: Record<string, OrderRecord> = {};
        for (const entry of orderEntries) {
          if (entry.status === "fulfilled") {
            ordersById[entry.value[0]] = entry.value[1];
          }
        }

        const feed = mapFeed(events, ordersById);
        const paymentRows = mapPayments(events);
        const failures = buildFailures(feed);
        const kpis = buildKpis(agents, feed, paymentRows);

        if (cancelled) return;

        setData({
          agents,
          events: feed,
          ordersById,
          paymentRows,
          failures,
          kpis
        });

        if (agents.length > 0) {
          setSelectedAgent((existing) => existing ?? agents[0].agentId);
        }

        if (agents.length === 0 && feed.length === 0) {
          setPanel({ state: "empty", message: "No API data returned for dashboard panels." });
        } else {
          setPanel({ state: "ready" });
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Unknown API failure";
          setPanel({ state: "error", message });
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const orders = useMemo(
    () => Object.values(data.ordersById).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data.ordersById]
  );

  const runCatalogSearch = useCallback(
    async (query: string): Promise<void> => {
      if (!token) return;
      setCatalogError(undefined);
      setCatalogLoading(true);
      try {
        const products = await searchCatalog(query, token);
        setCatalogProducts(products);
      } catch (error) {
        setCatalogProducts([]);
        setCatalogError(error instanceof Error ? error.message : "Catalog request failed");
      } finally {
        setCatalogLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (!token) return;
    void runCatalogSearch("running shoes");
  }, [token, runCatalogSearch]);

  if (panel.state === "loading") {
    return (
      <PanelState
        state="loading"
        title="Loading dashboard"
        description="Fetching agents, events, orders, and health status."
      />
    );
  }

  if (panel.state === "error") {
    return (
      <PanelState
        state="error"
        title="Dashboard fetch failed"
        description={
          panel.message ?? "Unable to read API data. Check API token and endpoint configuration."
        }
      />
    );
  }

  if (panel.state === "empty") {
    return (
      <div className="dash-shell">
        <SidebarNav activeTab={activeTab} onChange={setActiveTab} apiHealth={apiHealth} />
        <main className="dash-main">
          <PanelState
            state="empty"
            title="No dashboard data yet"
            description={
              panel.message ?? "Create agents and generate events to populate this workspace."
            }
          />
        </main>
      </div>
    );
  }

  return (
    <div className="dash-shell">
      <SidebarNav
        activeTab={activeTab}
        onChange={setActiveTab}
        apiHealth={
          health?.dependencies
            ? `${apiHealth} / db:${health.dependencies.database} / pay:${health.dependencies.paymentProviderMode}`
            : apiHealth
        }
      />
      <main className="dash-main">
        {activeTab === "overview" ? (
          <>
            <KpiCards items={data.kpis} />
            <section className="dash-overview-grid">
              <UnifiedFeed
                items={data.events}
                activeFilter={feedFilter}
                onFilterChange={setFeedFilter}
              />
              <PaymentFlowRail />
            </section>
          </>
        ) : null}

        {activeTab === "agents" ? (
          <AgentsTable
            agents={data.agents}
            selectedAgentId={selectedAgent}
            onSelectAgent={setSelectedAgent}
            events={data.events}
            failures={data.failures}
          />
        ) : null}

        {activeTab === "payments" ? (
          <PaymentsTable rows={data.paymentRows} explorerUrl={explorerUrl} />
        ) : null}
        {activeTab === "trading" ? <TradingPanel orders={orders} /> : null}
        {activeTab === "commerce" ? (
          <CatalogPanel
            products={catalogProducts}
            loading={catalogLoading}
            error={catalogError}
            onSearch={runCatalogSearch}
          />
        ) : null}
        {activeTab === "failures" ? <FailureBuckets items={data.failures} /> : null}
      </main>
    </div>
  );
}
