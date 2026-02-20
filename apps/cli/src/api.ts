import { createHash } from "node:crypto";
import type {
  CreateAgentResponse,
  ListAgentsResponse,
  ListEventsResponse,
  MarketExecuteRequest,
  MarketExecuteResponse,
  MarketQuoteRequest,
  MarketQuoteResponse
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
    const body = await response.text();
    let parsedCode: string | undefined;
    let parsedMessage: string | undefined;
    try {
      const parsed = JSON.parse(body) as { code?: string; message?: string };
      parsedCode = parsed.code;
      parsedMessage = parsed.message;
    } catch {
      parsedCode = undefined;
    }
    if (parsedCode) {
      throw new Error(`${parsedCode}: ${parsedMessage ?? "request failed"}`);
    }
    throw new Error(`API ${response.status}: ${body}`);
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

export async function monitorAgent(agentId: string): Promise<ListEventsResponse> {
  return apiRequest<ListEventsResponse>(`/events?agentId=${encodeURIComponent(agentId)}`);
}

export interface StrategyExecutionRequest {
  agentId: string;
  strategy: string;
  xPayment?: string;
}

export interface StrategyExecutionResult {
  quote: MarketQuoteResponse;
  execution: MarketExecuteResponse;
}

export async function executeStrategyOnce(input: StrategyExecutionRequest): Promise<StrategyExecutionResult> {
  const orderInput = mapStrategyToOrderInput(input.strategy);
  const quotePayment = await resolveXPayment(
    { agentId: input.agentId, route: "/markets/quote" },
    input.xPayment
  );

  const quoteRequest: MarketQuoteRequest = {
    agentId: input.agentId,
    ...orderInput
  };

  const quote = await apiRequest<MarketQuoteResponse>("/markets/quote", {
    method: "POST",
    headers: {
      "x-payment": quotePayment
    },
    body: JSON.stringify(quoteRequest)
  });

  const executeRequest: MarketExecuteRequest = {
    agentId: input.agentId,
    quoteId: quote.quoteId,
    ...orderInput
  };

  const executePayment = await resolveXPayment(
    { agentId: input.agentId, route: "/markets/execute" },
    input.xPayment
  );
  const execution = await apiRequest<MarketExecuteResponse>("/markets/execute", {
    method: "POST",
    headers: {
      "x-payment": executePayment,
      "idempotency-key": deriveExecutionIdempotencyKey(executeRequest)
    },
    body: JSON.stringify(executeRequest)
  });

  return { quote, execution };
}

function mapStrategyToOrderInput(strategy: string): Omit<MarketQuoteRequest, "agentId"> {
  switch (strategy.toLowerCase()) {
    case "mean-revert":
      return { venueType: "SPOT", marketId: "KITE_bUSDT_BASE_SEPOLIA", side: "BUY", size: "1" };
    case "momentum":
      return { venueType: "SPOT", marketId: "KITE_bUSDT_BASE_SEPOLIA", side: "BUY", size: "0.2" };
    case "risk-check":
      return { venueType: "SPOT", marketId: "KITE_bUSDT_BASE_SEPOLIA", side: "BUY", size: "1200" };
    default:
      return { venueType: "SPOT", marketId: "KITE_bUSDT_BASE_SEPOLIA", side: "BUY", size: "1" };
  }
}

function deriveExecutionIdempotencyKey(input: MarketExecuteRequest): string {
  const nonce = input.quoteId ?? "no-quote";
  const source = `${input.agentId}|${input.marketId}|${input.side}|${input.size}|${nonce}`;
  return createHash("sha256").update(source).digest("hex");
}
