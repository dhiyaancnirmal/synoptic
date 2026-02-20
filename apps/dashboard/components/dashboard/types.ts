import type { AgentRecord } from "@synoptic/types/agent";
import type { SynopticEventEnvelope, SynopticEventName } from "@synoptic/types/events";
import type { OrderRecord, OrderRejectionReason, VenueType } from "@synoptic/types/orders";
import type { ExecutionSource } from "@synoptic/types/rest";

export type DashboardTab = "overview" | "agents" | "payments" | "trading" | "commerce" | "failures";
export type FeedFilter = "all" | "ecommerce" | "spot" | "payment" | "failure";

export interface DashboardKpiModel {
  label: string;
  value: string;
  hint: string;
}

export interface UnifiedFeedItem {
  id: string;
  timestampRaw: string;
  timestamp: string;
  eventName: SynopticEventName;
  status: SynopticEventEnvelope["status"];
  agentId: string;
  domain: FeedFilter;
  detail: string;
  reason?: OrderRejectionReason;
  orderId?: string;
  route?: string;
  settlementId?: string;
  txHash?: string;
  executionSource?: ExecutionSource;
  uniswapQuoteRequestId?: string;
  uniswapSwapRequestId?: string;
}

export interface PaymentRowModel {
  id: string;
  timestampRaw: string;
  timestamp: string;
  agentId: string;
  route: string;
  amount: string;
  asset: string;
  network: string;
  settlementId: string;
  txHash?: string;
  status: "challenge" | "success" | "error";
}

export interface FailureBucketModel {
  reason: OrderRejectionReason;
  count: number;
  lastOccurrence: string;
  affectedAgent: string;
  action: string;
}

export interface DashboardDataModel {
  agents: AgentRecord[];
  events: UnifiedFeedItem[];
  ordersById: Record<string, OrderRecord>;
  paymentRows: PaymentRowModel[];
  failures: FailureBucketModel[];
  kpis: DashboardKpiModel[];
}

export function mapVenueToFilter(venue?: VenueType): FeedFilter {
  if (venue === "SPOT") return "spot";
  return "all";
}
