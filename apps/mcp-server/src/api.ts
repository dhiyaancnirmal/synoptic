import { createHash, randomUUID } from "node:crypto";
import { buildPaymentHeader } from "@synoptic/types/payments";
import type {
  CreateAgentResponse,
  GetAgentResponse,
  GetOrderResponse,
  HealthResponse,
  ListAgentsResponse,
  ListEventsResponse,
  MarketExecuteRequest,
  MarketExecuteResponse,
  MarketQuoteRequest,
  MarketQuoteResponse,
  ShopifyCatalogSearchRequest,
  ShopifyCatalogSearchResponse,
  ShopifyProductDetailsResponse
} from "@synoptic/types/rest";

const API_URL = process.env.SYNOPTIC_API_URL ?? "http://localhost:3001";
const API_TOKEN = process.env.SYNOPTIC_API_TOKEN ?? "";

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");

  if (API_TOKEN) {
    headers.set("authorization", `Bearer ${API_TOKEN}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    let details = "";
    let parsedErrorCode: string | undefined;
    let parsedErrorMessage: string | undefined;
    try {
      details = await response.text();
      const parsed = JSON.parse(details) as { code?: string; message?: string };
      parsedErrorCode = parsed.code;
      parsedErrorMessage = parsed.message;
    } catch {
      details = response.statusText;
    }

    if (parsedErrorCode) {
      throw new Error(`${parsedErrorCode}: ${parsedErrorMessage ?? "request failed"}`);
    }

    throw new Error(`API request failed: ${response.status} ${details || response.statusText}`);
  }

  return (await response.json()) as T;
}

async function getPaymentMode(): Promise<"mock" | "http"> {
  try {
    const health = await apiRequest<HealthResponse>("/health");
    return health.dependencies?.paymentProviderMode ?? "mock";
  } catch {
    return "mock";
  }
}

function buildPaymentHeaderForMode(mode: "mock" | "http", payer: string): string {
  return buildPaymentHeader({
    paymentId: randomUUID(),
    signature: mode === "mock" ? `sig_${randomUUID()}` : `http_sig_${randomUUID()}`,
    amount: process.env.X402_PRICE_USD ?? "0.10",
    asset: process.env.SETTLEMENT_TOKEN_ADDRESS ?? "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63",
    network: process.env.KITE_CHAIN_ID ?? "2368",
    payer
  });
}

export async function createAgent(ownerAddress: string): Promise<CreateAgentResponse> {
  return apiRequest<CreateAgentResponse>("/agents", {
    method: "POST",
    body: JSON.stringify({ ownerAddress })
  });
}

export async function listAgents(): Promise<ListAgentsResponse> {
  return apiRequest<ListAgentsResponse>("/agents");
}

export async function setAgentStatus(agentId: string, status: "ACTIVE" | "PAUSED" | "STOPPED"): Promise<GetAgentResponse> {
  return apiRequest<GetAgentResponse>(`/agents/${encodeURIComponent(agentId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
}

export async function quoteMarket(input: MarketQuoteRequest): Promise<MarketQuoteResponse> {
  const paymentHeader = buildPaymentHeaderForMode(await getPaymentMode(), "mcp-server");

  return apiRequest<MarketQuoteResponse>("/markets/quote", {
    method: "POST",
    headers: {
      "x-payment": paymentHeader
    },
    body: JSON.stringify(input)
  });
}

export async function executeMarket(input: MarketExecuteRequest): Promise<MarketExecuteResponse> {
  const paymentHeader = buildPaymentHeaderForMode(await getPaymentMode(), "mcp-server");

  return apiRequest<MarketExecuteResponse>("/markets/execute", {
    method: "POST",
    headers: {
      "x-payment": paymentHeader,
      "idempotency-key": deriveExecutionIdempotencyKey(input)
    },
    body: JSON.stringify(input)
  });
}

function deriveExecutionIdempotencyKey(input: MarketExecuteRequest): string {
  const nonce = input.quoteId ?? "no-quote";
  const source = `${input.agentId}|${input.marketId}|${input.side}|${input.size}|${nonce}`;
  return createHash("sha256").update(source).digest("hex");
}

export async function fetchOrder(orderId: string): Promise<GetOrderResponse> {
  return apiRequest<GetOrderResponse>(`/orders/${orderId}`);
}

export async function listAgentEvents(agentId: string): Promise<ListEventsResponse> {
  return apiRequest<ListEventsResponse>(`/events?agentId=${encodeURIComponent(agentId)}`);
}

export async function searchShopifyCatalog(input: ShopifyCatalogSearchRequest): Promise<ShopifyCatalogSearchResponse> {
  return apiRequest<ShopifyCatalogSearchResponse>("/shopify/catalog/search", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function getShopifyProductDetails(upid: string): Promise<ShopifyProductDetailsResponse> {
  return apiRequest<ShopifyProductDetailsResponse>(`/shopify/catalog/product/${encodeURIComponent(upid)}`);
}
