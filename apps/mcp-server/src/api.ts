import { randomUUID } from "node:crypto";
import type {
  CreateAgentResponse,
  GetOrderResponse,
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
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
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

export async function quoteMarket(input: MarketQuoteRequest): Promise<MarketQuoteResponse> {
  const paymentHeader = buildMockPaymentHeader();

  return apiRequest<MarketQuoteResponse>("/markets/quote", {
    method: "POST",
    headers: {
      "x-payment": paymentHeader
    },
    body: JSON.stringify(input)
  });
}

export async function executeMarket(input: MarketExecuteRequest): Promise<MarketExecuteResponse> {
  const paymentHeader = buildMockPaymentHeader();

  return apiRequest<MarketExecuteResponse>("/markets/execute", {
    method: "POST",
    headers: {
      "x-payment": paymentHeader,
      "idempotency-key": input.quoteId ?? randomUUID()
    },
    body: JSON.stringify(input)
  });
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

function buildMockPaymentHeader(): string {
  const payload = {
    paymentId: randomUUID(),
    signature: `sig_${randomUUID()}`,
    amount: process.env.X402_PRICE_USD ?? "0.10",
    asset: process.env.SETTLEMENT_TOKEN_ADDRESS ?? "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63",
    network: process.env.KITE_CHAIN_ID ?? "2368",
    payer: "mcp-server"
  };

  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
}
