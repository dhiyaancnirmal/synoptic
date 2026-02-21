import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { mapActivity, mapAgent, mapPayment, mapTrade } from "./index.js";

function loadFixture(name: string): Record<string, unknown> {
  const raw = readFileSync(join(process.cwd(), "lib", "api", "__fixtures__", name), "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
}

test("compat and canonical agents map to AgentVM", () => {
  const compat = loadFixture("compat-agents.json");
  const canonical = loadFixture("canonical-agents.json");

  const compatAgent = mapAgent((compat.agents as unknown[])[0]);
  const canonicalAgent = mapAgent((canonical.agents as unknown[])[0]);

  assert.equal(compatAgent.id, "agent-1");
  assert.equal(compatAgent.status, "running");
  assert.equal(canonicalAgent.name, "Oracle Agent");
  assert.equal(canonicalAgent.status, "running");
});

test("canonical payment/trade/activity fixtures map to view models", () => {
  const payments = loadFixture("canonical-payments.json");
  const trades = loadFixture("canonical-trades.json");
  const activity = loadFixture("canonical-activity.json");

  const payment = mapPayment((payments.payments as unknown[])[0]);
  const trade = mapTrade((trades.trades as unknown[])[0]);
  const event = mapActivity((activity.events as unknown[])[0]);

  assert.equal(payment.status, "settled");
  assert.equal(trade.stage, "confirmed");
  assert.equal(trade.executionTxHash, "0xabc");
  assert.equal(event.chain, "monad-testnet");
});

// Documents deprecated sepoliaTxHash compatibility shim: legacy API payloads map to executionTxHash.
test("legacy trade payload keys still map to execution fields", () => {
  const trade = mapTrade({
    id: "legacy-1",
    agentId: "agent-1",
    status: "confirmed",
    tokenIn: "ETH",
    tokenOut: "USDT",
    amountIn: "1",
    amountOut: "100",
    sepoliaTxHash: "0xlegacy",
    chainId: 10143,
    createdAt: "2026-02-20T00:00:00.000Z"
  });

  assert.equal(trade.executionTxHash, "0xlegacy");
});

test("mainnet Monad chainId maps to monad label", () => {
  const trade = mapTrade({
    id: "mainnet-1",
    agentId: "agent-1",
    status: "confirmed",
    tokenIn: "MON",
    tokenOut: "WMON",
    amountIn: "1",
    amountOut: "1",
    chainId: 143,
    createdAt: "2026-02-20T00:00:00.000Z"
  });

  assert.equal(trade.executionChain, "monad");
});
