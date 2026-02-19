import { randomUUID } from "node:crypto";
import { buildPaymentHeader } from "@synoptic/types/payments";
import type {
  CreateAgentResponse,
  HealthResponse,
  ListAgentsResponse,
  ListEventsResponse,
  MarketExecuteRequest,
  MarketExecuteResponse,
  MarketQuoteRequest,
  MarketQuoteResponse
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
    const body = await response.text();
    throw new Error(`API ${response.status}: ${body}`);
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

export async function monitorAgent(agentId: string): Promise<ListEventsResponse> {
  return apiRequest<ListEventsResponse>(`/events?agentId=${encodeURIComponent(agentId)}`);
}

export interface StrategyExecutionRequest {
  agentId: string;
  strategy: string;
}

export interface StrategyExecutionResult {
  quote: MarketQuoteResponse;
  execution: MarketExecuteResponse;
}

export async function executeStrategyOnce(input: StrategyExecutionRequest): Promise<StrategyExecutionResult> {
  const orderInput = mapStrategyToOrderInput(input.strategy);
  const paymentMode = await getPaymentMode();

  const quoteRequest: MarketQuoteRequest = {
    agentId: input.agentId,
    ...orderInput
  };

  const quote = await apiRequest<MarketQuoteResponse>("/markets/quote", {
    method: "POST",
    headers: {
      "x-payment": buildPaymentHeaderForMode(paymentMode, "synoptic-cli")
    },
    body: JSON.stringify(quoteRequest)
  });

  const executeRequest: MarketExecuteRequest = {
    agentId: input.agentId,
    quoteId: quote.quoteId,
    ...orderInput
  };

  const execution = await apiRequest<MarketExecuteResponse>("/markets/execute", {
    method: "POST",
    headers: {
      "x-payment": buildPaymentHeaderForMode(paymentMode, "synoptic-cli"),
      "idempotency-key": randomUUID()
    },
    body: JSON.stringify(executeRequest)
  });

  return { quote, execution };
}

function mapStrategyToOrderInput(strategy: string): Omit<MarketQuoteRequest, "agentId"> {
  switch (strategy.toLowerCase()) {
    case "mean-revert":
      return { venueType: "SPOT", marketId: "ETH-USD", side: "BUY", size: "1" };
    case "momentum":
      return { venueType: "SPOT", marketId: "BTC-USD", side: "BUY", size: "0.2" };
    case "risk-check":
      return { venueType: "SPOT", marketId: "BTC-USD", side: "BUY", size: "1200" };
    default:
      return { venueType: "SPOT", marketId: "ETH-USD", side: "BUY", size: "1" };
  }
}
