import type { AgentRecord } from "../agent/index.js";
import type { SynopticEventEnvelope } from "../events/index.js";
import type { OrderRecord, OrderSide, VenueType } from "../orders/index.js";
import type { PaymentRequirement, PaymentSettlement } from "../payments/index.js";

export interface HealthResponse {
  status: string;
  service: string;
  timestamp: string;
  dependencies?: {
    database: "up" | "down";
    paymentProviderMode: "mock" | "http";
    facilitatorMode?: "mock" | "http";
    authMode?: "siwe" | "dev";
    tradingMode?: "bridge_to_base_v1";
  };
}

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "PAYMENT_REQUIRED"
  | "INVALID_PAYMENT"
  | "FACILITATOR_UNAVAILABLE"
  | "UNSUPPORTED_MARKET"
  | "LIQUIDITY_UNAVAILABLE"
  | "BRIDGE_REQUIRED"
  | "BRIDGE_TIMEOUT"
  | "BRIDGE_FAILED"
  | "DESTINATION_CREDIT_NOT_FOUND"
  | "SWAP_REVERTED"
  | "SLIPPAGE_EXCEEDED"
  | "IDEMPOTENCY_CONFLICT"
  | "INTERNAL_ERROR";

export interface ApiErrorResponse {
  code: ApiErrorCode;
  message: string;
  requestId?: string;
  details?: {
    reason?: string;
    retryable?: boolean;
    [key: string]: unknown;
  };
}

export interface SiweChallengeRequest {
  address: string;
}

export interface SiweChallengeResponse {
  nonce: string;
  message: string;
}

export interface SiweVerifyRequest {
  message: string;
  signature: string;
  agentId: string;
  ownerAddress: string;
  scopes?: string[];
}

export interface SiweVerifyResponse {
  token: string;
}

export interface CreateAgentRequest {
  ownerAddress: string;
}

export interface CreateAgentResponse {
  agent: AgentRecord;
}

export interface ListAgentsResponse {
  agents: AgentRecord[];
  nextCursor?: string;
}

export interface GetAgentResponse {
  agent: AgentRecord;
}

export interface MarketQuoteRequest {
  agentId: string;
  venueType: VenueType;
  marketId: string;
  side: OrderSide;
  size: string;
  limitPrice?: string;
}

export interface MarketQuoteResponse {
  quoteId: string;
  agentId: string;
  venueType: VenueType;
  marketId: string;
  side: OrderSide;
  size: string;
  limitPrice?: string;
  estimatedPrice: string;
  notional: string;
  fee: string;
  expiresAt: string;
  route: "UNISWAP_V3";
  poolAddress?: string;
  priceImpactBps?: number;
  liquidityCheck: "PASS" | "FAIL";
}

export interface MarketExecuteRequest {
  agentId: string;
  quoteId?: string;
  venueType: VenueType;
  marketId: string;
  side: OrderSide;
  size: string;
  limitPrice?: string;
}

export interface MarketExecuteResponse {
  order: OrderRecord;
  settlement: PaymentSettlement;
  executionPath: "BASE_SEPOLIA_UNISWAP_V3";
  bridge?: {
    required: boolean;
    sourceTxHash?: string;
    destinationTxHash?: string;
    status: "SKIPPED" | "SUBMITTED" | "CONFIRMED" | "DELAYED" | "FAILED";
  };
  swap?: {
    txHash?: string;
    status: "SUBMITTED" | "CONFIRMED" | "FAILED";
    amountIn?: string;
    amountOut?: string;
  };
  failureCode?:
    | "LIQUIDITY_UNAVAILABLE"
    | "BRIDGE_TIMEOUT"
    | "BRIDGE_FAILED"
    | "DESTINATION_CREDIT_NOT_FOUND"
    | "SWAP_REVERTED"
    | "RISK_LIMIT"
    | "UNSUPPORTED_MARKET"
    | "SLIPPAGE_EXCEEDED";
}

export interface GetOrderResponse {
  order: OrderRecord;
}

export interface ListEventsResponse {
  events: SynopticEventEnvelope[];
  nextCursor?: string;
}

export interface X402ChallengeResponse {
  code: "PAYMENT_REQUIRED";
  message: string;
  payment: PaymentRequirement;
  retryWithHeader: "X-PAYMENT";
}

export interface ShopifyCatalogSearchRequest {
  query: string;
  available_for_sale?: boolean;
  min_price?: number;
  max_price?: number;
  products_limit?: number;
}

export interface ShopifyCatalogSearchResponse {
  data: unknown;
}

export interface ShopifyProductDetailsResponse {
  data: unknown;
}
