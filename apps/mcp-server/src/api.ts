import { createHash } from "node:crypto";
import type {
  CreateAgentResponse,
  GetAgentResponse,
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
import { resolveXPayment } from "./x402.js";

const API_URL = process.env.SYNOPTIC_API_URL ?? "http://localhost:3001";
let cachedApiToken: string | undefined;

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  const token = await resolveApiToken();
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const details = await response.text();
    let parsed: { code?: string; message?: string } | undefined;
    try {
      parsed = JSON.parse(details) as { code?: string; message?: string };
    } catch {
      // Ignore JSON parsing errors and use raw response text below.
    }
    if (parsed?.code) {
      throw new Error(`${parsed.code}: ${parsed.message ?? "request failed"}`);
    }

    throw new Error(`API request failed: ${response.status} ${details || response.statusText}`);
  }

  return (await response.json()) as T;
}

async function resolveApiToken(): Promise<string> {
  if (cachedApiToken) {
    return cachedApiToken;
  }

  const staticToken = process.env.SYNOPTIC_API_TOKEN;
  if (typeof staticToken === "string" && staticToken.trim().length > 0) {
    cachedApiToken = staticToken;
    return staticToken;
  }

  const passportToken = process.env.SYNOPTIC_PASSPORT_TOKEN;
  const agentId = process.env.SYNOPTIC_AGENT_ID;
  const ownerAddress = process.env.SYNOPTIC_OWNER_ADDRESS;
  if (!passportToken || !agentId || !ownerAddress) {
    return "";
  }

  const response = await fetch(`${API_URL}/auth/passport/exchange`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ passportToken, agentId, ownerAddress })
  });
  if (!response.ok) {
    throw new Error(`Passport token exchange failed: ${response.status}`);
  }

  const payload = (await response.json()) as { token?: string };
  if (!payload.token) {
    throw new Error("Passport token exchange did not return token");
  }

  cachedApiToken = payload.token;
  return payload.token;
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

export async function quoteMarket(input: MarketQuoteRequest, xPayment?: string): Promise<MarketQuoteResponse> {
  const paymentHeader = await resolveXPayment({ agentId: input.agentId, route: "/markets/quote" }, xPayment);
  return apiRequest<MarketQuoteResponse>("/markets/quote", {
    method: "POST",
    headers: {
      "x-payment": paymentHeader
    },
    body: JSON.stringify(input)
  });
}

export async function executeMarket(input: MarketExecuteRequest, xPayment?: string): Promise<MarketExecuteResponse> {
  const paymentHeader = await resolveXPayment({ agentId: input.agentId, route: "/markets/execute" }, xPayment);
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
