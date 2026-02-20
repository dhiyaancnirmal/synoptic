import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { MarketExecuteRequest, MarketExecuteResponse, MarketQuoteRequest, MarketQuoteResponse } from "@synoptic/types/rest";

interface DemoTradeRequest {
  agentId?: string;
  size?: string;
  limitPrice?: string;
  token?: string;
  xPayment?: string;
}

interface ApiFailureShape {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}

const API_URL = process.env.SYNOPTIC_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const DEFAULT_MARKET_ID = "KITE_bUSDT_BASE_SEPOLIA";
const DEFAULT_SIZE = "1";

export async function POST(request: Request): Promise<Response> {
  let body: DemoTradeRequest;
  try {
    body = (await request.json()) as DemoTradeRequest;
  } catch {
    body = {};
  }

  const token = readFirstNonEmpty(process.env.SYNOPTIC_API_TOKEN, body.token);
  if (!token) {
    return NextResponse.json(
      { message: "Missing API token. Set SYNOPTIC_API_TOKEN for dashboard server runtime." },
      { status: 500 }
    );
  }

  const tokenAgent = readFirstNonEmpty(body.agentId, process.env.SYNOPTIC_DEMO_AGENT_ID);
  const agentId = tokenAgent;
  if (!agentId) {
    return NextResponse.json(
      { message: "Missing agentId. Pass one from dashboard selection or set SYNOPTIC_DEMO_AGENT_ID." },
      { status: 400 }
    );
  }

  const quotePayment = await resolveXPayment({
    agentId,
    route: "/markets/quote",
    providedHeader: body.xPayment
  });
  if (!quotePayment) {
    return NextResponse.json(
      { message: "Missing demo X-PAYMENT source. Set SYNOPTIC_DEMO_X_PAYMENT or mint env vars." },
      { status: 500 }
    );
  }
  const executePayment = await resolveXPayment({
    agentId,
    route: "/markets/execute",
    providedHeader: body.xPayment
  });
  if (!executePayment) {
    return NextResponse.json(
      { message: "Unable to mint X-PAYMENT for execute route." },
      { status: 500 }
    );
  }

  const size = readFirstNonEmpty(body.size, DEFAULT_SIZE) ?? DEFAULT_SIZE;
  const limitPrice = readFirstNonEmpty(body.limitPrice);

  const quoteRequest: MarketQuoteRequest = {
    agentId,
    venueType: "SPOT",
    marketId: DEFAULT_MARKET_ID,
    side: "BUY",
    size,
    limitPrice
  };

  const quoteResponse = await callSynoptic<MarketQuoteResponse>("/markets/quote", {
    method: "POST",
    headers: buildHeaders(token, quotePayment),
    body: JSON.stringify(quoteRequest)
  });

  if (!quoteResponse.ok) {
    return NextResponse.json(
      {
        message: quoteResponse.message,
        code: quoteResponse.code,
        status: quoteResponse.status,
        details: quoteResponse.details
      },
      { status: quoteResponse.status }
    );
  }

  const executeRequest: MarketExecuteRequest = {
    ...quoteRequest,
    quoteId: quoteResponse.data.quoteId
  };

  const executeResponse = await callSynoptic<MarketExecuteResponse>("/markets/execute", {
    method: "POST",
    headers: {
      ...buildHeaders(token, executePayment),
      "idempotency-key": `dash-demo-${randomUUID()}`
    },
    body: JSON.stringify(executeRequest)
  });

  if (!executeResponse.ok) {
    return NextResponse.json(
      {
        message: executeResponse.message,
        code: executeResponse.code,
        status: executeResponse.status,
        details: executeResponse.details
      },
      { status: executeResponse.status }
    );
  }

  return NextResponse.json({
    quote: quoteResponse.data,
    execution: executeResponse.data,
    evidence: {
      quoteId: quoteResponse.data.quoteId,
      orderId: executeResponse.data.order.orderId,
      settlementId: executeResponse.data.settlement.settlementId,
      executionSource: executeResponse.data.executionSource,
      swapTxHash: executeResponse.data.swap?.txHash,
      bridgeSourceTxHash: executeResponse.data.bridge?.sourceTxHash,
      bridgeDestinationTxHash: executeResponse.data.bridge?.destinationTxHash
    }
  });
}

function buildHeaders(token: string, xPayment: string): HeadersInit {
  return {
    authorization: `Bearer ${token}`,
    "x-payment": xPayment,
    "content-type": "application/json"
  };
}

async function resolveXPayment(params: {
  agentId: string;
  route: "/markets/quote" | "/markets/execute";
  providedHeader?: string;
}): Promise<string | undefined> {
  const explicit = readFirstNonEmpty(params.providedHeader, process.env.SYNOPTIC_DEMO_X_PAYMENT);
  if (explicit) {
    return explicit;
  }

  const mintUrl = process.env.SYNOPTIC_X402_MINT_URL;
  const mintToken = process.env.SYNOPTIC_X402_MINT_TOKEN;
  if (!mintUrl || !mintToken) {
    return undefined;
  }

  const response = await fetch(mintUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${mintToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      agentId: params.agentId,
      route: params.route,
      amount: process.env.NEXT_PUBLIC_X402_AMOUNT ?? "0.10",
      network: process.env.NEXT_PUBLIC_KITE_CHAIN_ID ?? "2368",
      asset: process.env.NEXT_PUBLIC_SETTLEMENT_ASSET
    })
  });

  if (!response.ok) {
    return undefined;
  }

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return readFirstNonEmpty(
    typeof payload.xPayment === "string" ? payload.xPayment : undefined,
    typeof payload.x_payment === "string" ? payload.x_payment : undefined,
    typeof payload.paymentHeader === "string" ? payload.paymentHeader : undefined
  );
}

async function callSynoptic<T>(
  path: string,
  init: RequestInit
): Promise<
  | { ok: true; data: T; status: number }
  | { ok: false; status: number; message: string; code?: string; details?: Record<string, unknown> }
> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: "no-store"
  });

  const payloadText = await response.text();
  const parsed = parseJson(payloadText);

  if (!response.ok) {
    const failure = isApiFailure(parsed) ? parsed : undefined;
    return {
      ok: false,
      status: response.status,
      message: failure?.message ?? response.statusText ?? "Request failed",
      code: failure?.code,
      details: failure?.details
    };
  }

  if (!parsed) {
    return {
      ok: false,
      status: 502,
      message: "Synoptic API returned empty response"
    };
  }

  return {
    ok: true,
    status: response.status,
    data: parsed as T
  };
}

function parseJson(value: string): unknown {
  if (!value || value.trim().length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isApiFailure(value: unknown): value is ApiFailureShape {
  return Boolean(value) && typeof value === "object";
}

function readFirstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}
