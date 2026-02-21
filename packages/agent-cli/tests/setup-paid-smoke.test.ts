import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { setupCommand } from "../src/commands/setup.js";
import { createApiClient } from "../src/api-client.js";

const TEST_DIR = join(tmpdir(), `synoptic-agent-setup-paid-${Date.now()}`);

describe("setup + paid request smoke", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    process.env.SYNOPTIC_HOME = TEST_DIR;
    process.env.SYNOPTIC_API_URL = "https://api.test.local";
    delete process.env.KITE_MCP_BEARER_TOKEN;
    delete process.env.KITE_MCP_AUTHORIZATION;
    delete process.env.KITE_MCP_CLIENT_ID;

    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }

    let priceAttempts = 0;
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      const body =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : {};

      if (url.endsWith("/api/auth/wallet/challenge")) {
        return new Response(
          JSON.stringify({
            challengeId: "challenge-1",
            nonce: "nonce-1",
            message: "Sign in",
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            agentId: "agent-setup",
            ownerAddress: body.ownerAddress
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/api/auth/wallet/verify")) {
        return new Response(
          JSON.stringify({
            accessToken: "access-1",
            refreshToken: "refresh-1",
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            refreshExpiresAt: new Date(Date.now() + 120_000).toISOString(),
            agentId: "agent-setup",
            ownerAddress: body.ownerAddress ?? "0x0000000000000000000000000000000000000001"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.includes("/oracle/price")) {
        priceAttempts += 1;
        if (priceAttempts === 1) {
          return new Response(
            JSON.stringify({
              x402Version: 1,
              scheme: "gokite-aa",
              network: "kite-testnet",
              asset: "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63",
              payTo: "0x66ad7ef70cc88e37fa692d85c8a55ed4c1493251",
              maxAmountRequired: "1",
              paymentRequestId: "payreq-1",
              accepts: []
            }),
            { status: 402, headers: { "content-type": "application/json" } }
          );
        }

        const xPayment = init?.headers
          ? (init.headers as Record<string, string>)["x-payment"]
          : undefined;
        const requestId = init?.headers
          ? (init.headers as Record<string, string>)["x-payment-request-id"]
          : undefined;

        assert.equal(typeof xPayment, "string");
        assert.equal(requestId, "payreq-1");

        return new Response(
          JSON.stringify({
            pair: "ETH/USDT",
            price: 3000,
            timestamp: new Date().toISOString()
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      throw new Error(`Unexpected fetch url in setup-paid smoke test: ${url}`);
    }) as typeof fetch;
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    delete process.env.SYNOPTIC_HOME;
    delete process.env.SYNOPTIC_API_URL;
    globalThis.fetch = originalFetch;
  });

  it("completes setup then executes paid request retry path", async () => {
    await setupCommand();

    const mcpClient = {
      async getPayerAddr() {
        return "0x0000000000000000000000000000000000000002";
      },
      async approvePayment(_params: {
        payerAddr: string;
        payeeAddr: string;
        amount: string;
        tokenType: string;
        merchantName?: string;
      }) {
        return {
          paymentToken: JSON.stringify({
            scheme: "gokite-aa",
            network: "kite-testnet",
            x402Version: 1,
            payload: {
              authorization: {
                from: "0x0000000000000000000000000000000000000002",
                to: "0x66ad7ef70cc88e37fa692d85c8a55ed4c1493251",
                token: "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63",
                value: "1",
                validAfter: "0",
                validBefore: "9999999999",
                nonce: "0x1"
              },
              signature: "0xsig",
              sessionId: "session-1",
              metadata: {}
            }
          })
        };
      }
    };

    const apiClient = createApiClient(
      {
        apiUrl: "https://api.test.local",
        maxRetries: 0,
        backoffMs: 0,
        defaultAmount: "0.01",
        tickIntervalMs: 30000,
        kiteRpcUrl: "https://rpc-testnet.gokite.ai",
        monadRpcUrl: "https://testnet-rpc.monad.xyz",
        kiteExplorerUrl: "https://testnet.kitescan.ai",
        monadExplorerUrl: "https://testnet.monadexplorer.com",
        logLevel: "info"
      },
      mcpClient,
      { useSession: true }
    );

    const result = await apiClient.getPrice("ETH/USDT");
    assert.equal(result.price, 3000);
  });
});
