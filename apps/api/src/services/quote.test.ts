import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDeterministicQuote } from "./quote.js";

test("buildDeterministicQuote returns deterministic pricing for same market", () => {
  const input = {
    agentId: "agent-1",
    venueType: "SPOT" as const,
    marketId: "BTC-USD",
    side: "BUY" as const,
    size: "2"
  };

  const quote1 = buildDeterministicQuote(input);
  const quote2 = buildDeterministicQuote(input);

  assert.equal(quote1.estimatedPrice, quote2.estimatedPrice);
  assert.equal(quote1.notional, quote2.notional);
  assert.ok(quote1.quoteId.length > 0);
});
