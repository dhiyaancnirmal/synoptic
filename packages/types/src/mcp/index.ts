import type { AgentRecord } from "../agent/index.js";
import type { MarketExecuteRequest, MarketExecuteResponse, MarketQuoteRequest, MarketQuoteResponse } from "../rest/index.js";
import type { OrderRecord, VenueType } from "../orders/index.js";

export const MCP_TOOL_NAMES = [
  "synoptic.identity.status",
  "synoptic.market.list",
  "synoptic.trade.quote",
  "synoptic.trade.execute",
  "synoptic.order.status",
  "synoptic.autonomy.start",
  "synoptic.autonomy.stop"
] as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

export interface McpToolInvocation<TInput = unknown> {
  tool: McpToolName;
  input: TInput;
}

export interface McpIdentityStatusInput {
  agentId: string;
}

export interface McpIdentityStatusOutput {
  agent: AgentRecord;
}

export interface McpMarketListInput {
  venueType?: VenueType;
  query?: string;
  products_limit?: number;
}

export interface McpMarketListOutput {
  markets: Array<{
    marketId: string;
    venueType: VenueType;
    baseAsset: string;
    quoteAsset: string;
    mode?: "LIVE";
    engine?: string;
  }>;
  catalog?: unknown;
}

export interface McpTradeQuoteInput extends MarketQuoteRequest {
  xPayment?: string;
}
export type McpTradeQuoteOutput = MarketQuoteResponse;

export interface McpTradeExecuteInput extends MarketExecuteRequest {
  xPayment?: string;
}
export type McpTradeExecuteOutput = MarketExecuteResponse;

export interface McpOrderStatusInput {
  orderId: string;
}

export interface McpOrderStatusOutput {
  order: OrderRecord;
}

export interface McpAutonomyInput {
  agentId: string;
}

export interface McpAutonomyOutput {
  status: "ACTIVE" | "PAUSED" | "STOPPED";
}
