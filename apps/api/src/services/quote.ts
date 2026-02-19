import { randomUUID } from "node:crypto";
import type { MarketQuoteRequest, MarketQuoteResponse } from "@synoptic/types/rest";

export interface OraclePriceSource {
  getPrice(params: { marketId: string; side: "BUY" | "SELL" }): Promise<number>;
}

export interface QuoteServiceConfig {
  source: "deterministic" | "oracle";
  oracle?: OraclePriceSource;
}

export async function buildQuote(input: MarketQuoteRequest, config: QuoteServiceConfig): Promise<MarketQuoteResponse> {
  const baseline = await getBaselinePrice(input, config);
  const estimated = Number(input.limitPrice ?? baseline.toFixed(2));
  const size = Number(input.size);
  const notional = estimated * size;
  const fee = notional * 0.001;

  return {
    quoteId: randomUUID(),
    agentId: input.agentId,
    venueType: input.venueType,
    marketId: input.marketId,
    side: input.side,
    size: input.size,
    limitPrice: input.limitPrice,
    estimatedPrice: estimated.toFixed(2),
    notional: notional.toFixed(2),
    fee: fee.toFixed(2),
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  };
}

async function getBaselinePrice(input: MarketQuoteRequest, config: QuoteServiceConfig): Promise<number> {
  if (config.source === "oracle" && config.oracle) {
    return config.oracle.getPrice({ marketId: input.marketId, side: input.side });
  }

  return deterministicPrice(input.marketId, input.side);
}

// Test-only deterministic price function to keep local/integration fixtures stable.
export function deterministicPrice(marketId: string, side: "BUY" | "SELL"): number {
  let sum = 0;
  for (const char of marketId) {
    sum += char.charCodeAt(0);
  }

  const sideModifier = side === "BUY" ? 1.001 : 0.999;
  const base = 10 + (sum % 500) / 10;
  return base * sideModifier;
}
