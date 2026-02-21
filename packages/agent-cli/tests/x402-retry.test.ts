import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { ApiClient } from "../src/api-client.js";
import type { KiteMcpClient } from "../src/kite-mcp.js";

// Minimal config for testing
const testConfig = {
  apiUrl: "https://test.example.com",
  maxRetries: 1,
  backoffMs: 0,
  defaultAmount: "0.01",
  tickIntervalMs: 30000,
  kiteRpcUrl: "https://rpc-testnet.gokite.ai/",
  monadRpcUrl: "https://testnet-rpc.monad.xyz",
  kiteExplorerUrl: "https://testnet.kitescan.ai",
  monadExplorerUrl: "https://testnet.monadexplorer.com",
  logLevel: "info" as const
};

describe("ApiClient x402 auto-retry", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should parse 402 JSON body and retry with MCP payment token", async () => {
    let callCount = 0;
    let retryHeaders: Record<string, string> = {};

    const mockMcpClient: KiteMcpClient = {
      async getPayerAddr() {
        return "0xPayerAddress1234567890abcdef1234567890ab";
      },
      async approvePayment() {
        return { paymentToken: "mcp-approved-token-xyz" };
      }
    };

    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      callCount++;
      if (callCount === 1) {
        // First call: return 402 with challenge body
        return new Response(
          JSON.stringify({
            x402Version: 1,
            scheme: "gokite-aa",
            network: "kite-testnet",
            asset: "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63",
            payTo: "0x12343e649e6b2b2b77649DFAb88f103c02F3C78b",
            maxAmountRequired: "0.25",
            paymentRequestId: "pay_test_123",
            accepts: [
              {
                scheme: "gokite-aa",
                network: "kite-testnet",
                maxAmountRequired: "0.25",
                payTo: "0x12343e649e6b2b2b77649DFAb88f103c02F3C78b",
                asset: "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63",
                merchantName: "Synoptic Oracle"
              }
            ],
            message: "Payment required"
          }),
          { status: 402, headers: { "content-type": "application/json" } }
        );
      }
      // Second call (retry with payment): capture headers and return success
      const headers = init?.headers as Record<string, string> | undefined;
      retryHeaders = headers ?? {};
      return new Response(
        JSON.stringify({
          pair: "ETH/USDT",
          price: 3000.42,
          timestamp: Date.now(),
          source: "local-static"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const client = new ApiClient(testConfig, mockMcpClient);
    const result = await client.request<{ price: number }>("/oracle/price?pair=ETH/USDT");

    assert.strictEqual(callCount, 2, "Should have made exactly 2 fetch calls");
    assert.strictEqual(result.price, 3000.42);
    assert.strictEqual(retryHeaders["x-payment"], "mcp-approved-token-xyz");
    assert.strictEqual(retryHeaders["x-payment-request-id"], "pay_test_123");
  });

  it("should throw descriptive error when MCP client is null and 402 received", async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          x402Version: 1,
          payTo: "0x1234",
          asset: "0x5678",
          maxAmountRequired: "0.25",
          paymentRequestId: "p1",
          accepts: []
        }),
        { status: 402, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const client = new ApiClient(testConfig, null);
    await assert.rejects(() => client.request("/oracle/price"), {
      message: /Kite MCP not configured/
    });
  });

  it("should throw when 402 body has no parseable challenge", async () => {
    const mockMcpClient: KiteMcpClient = {
      async getPayerAddr() {
        return "0xAddr";
      },
      async approvePayment() {
        return { paymentToken: "tok" };
      }
    };

    globalThis.fetch = (async () => {
      return new Response("Not JSON", {
        status: 402,
        headers: { "content-type": "text/plain" }
      });
    }) as typeof fetch;

    const client = new ApiClient(testConfig, mockMcpClient);
    await assert.rejects(() => client.request("/oracle/price"), {
      message: /no parseable x402 challenge/
    });
  });

  it("should throw after retry fails with non-200 status", async () => {
    let callCount = 0;
    const mockMcpClient: KiteMcpClient = {
      async getPayerAddr() {
        return "0xPayerAddr";
      },
      async approvePayment() {
        return { paymentToken: "tok-retry" };
      }
    };

    globalThis.fetch = (async () => {
      callCount++;
      if (callCount % 2 === 1) {
        // Odd calls: return 402 with valid challenge
        return new Response(
          JSON.stringify({
            x402Version: 1,
            payTo: "0x1",
            asset: "0x2",
            maxAmountRequired: "0.10",
            paymentRequestId: "p2",
            accepts: []
          }),
          { status: 402 }
        );
      }
      // Even calls (retries after payment): also fail
      return new Response('{"code":"PAYMENT_VERIFY_FAILED"}', { status: 402 });
    }) as typeof fetch;

    const client = new ApiClient({ ...testConfig, maxRetries: 0 }, mockMcpClient);
    await assert.rejects(() => client.request("/oracle/price"), {
      message: /HTTP 402 after x402 payment/
    });
  });
});
