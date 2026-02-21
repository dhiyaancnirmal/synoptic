import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { ApiClient } from "../src/api-client.js";

const testConfig = {
  apiUrl: "https://test.example.com",
  maxRetries: 0,
  backoffMs: 0,
  defaultAmount: "0.01",
  tickIntervalMs: 30000,
  kiteRpcUrl: "https://rpc-testnet.gokite.ai/",
  monadRpcUrl: "https://testnet-rpc.monad.xyz",
  kiteExplorerUrl: "https://testnet.kitescan.ai",
  monadExplorerUrl: "https://testnet.monadexplorer.com",
  logLevel: "info" as const
};

describe("ApiClient envelope unwrapping", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should unwrap { code: OK, data: ... } envelope for getTrades", async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          code: "OK",
          message: "ok",
          requestId: "req_1",
          data: {
            trades: [
              {
                id: "t1",
                status: "confirmed",
                tokenIn: "ETH",
                tokenOut: "USDC",
                amountIn: "0.01",
                amountOut: "30.42",
                executionTxHash: "0xabc123",
                createdAt: "2026-02-20T00:00:00Z"
              }
            ]
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const client = new ApiClient(testConfig, null);
    const result = await client.getTrades();
    assert.strictEqual(result.trades.length, 1);
    assert.strictEqual(result.trades[0].id, "t1");
    assert.strictEqual(result.trades[0].tokenIn, "ETH");
  });

  it("should unwrap { code: OK, data: ... } envelope for getPayments", async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          code: "OK",
          message: "ok",
          requestId: "req_2",
          data: {
            payments: [
              {
                id: "p1",
                status: "settled",
                amount: "0.25",
                txHash: "0xdef456",
                createdAt: "2026-02-20T00:00:00Z"
              }
            ]
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const client = new ApiClient(testConfig, null);
    const result = await client.getPayments();
    assert.strictEqual(result.payments.length, 1);
    assert.strictEqual(result.payments[0].id, "p1");
    assert.strictEqual(result.payments[0].status, "settled");
  });

  it("should pass through raw responses that have no envelope", async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          pair: "ETH/USDT",
          price: 3000.5,
          timestamp: 1234567890,
          source: "coingecko"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const client = new ApiClient(testConfig, null);
    const result = await client.getPrice("ETH/USDT");
    assert.strictEqual(result.price, 3000.5);
  });

  it("should handle health endpoint raw response", async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          status: "ok",
          service: "agent-server",
          timestamp: "2026-02-20T00:00:00Z",
          dependencies: { database: "up", facilitator: "real" }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const client = new ApiClient(testConfig, null);
    const result = await client.getHealth();
    assert.strictEqual(result.status, "ok");
    assert.strictEqual(result.dependencies.database, "up");
  });
});
