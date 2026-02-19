import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuote } from "./quote.js";

test("buildQuote returns deterministic pricing for same market", async () => {
  const input = {
    agentId: "agent-1",
    venueType: "SPOT" as const,
    marketId: "BTC-USD",
    side: "BUY" as const,
    size: "2"
  };

  const quote1 = await buildQuote(input, { source: "deterministic" });
  const quote2 = await buildQuote(input, { source: "deterministic" });

  assert.equal(quote1.estimatedPrice, quote2.estimatedPrice);
  assert.equal(quote1.notional, quote2.notional);
  assert.ok(quote1.quoteId.length > 0);
});
