import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../server.js";
import { createTestAuthHeaders } from "./test-auth.js";

test("POST /trade/quote returns 402 without x-payment header", async (t) => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.includes("/v2/verify")) {
      return new Response(JSON.stringify({ valid: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    if (url.includes("/v2/settle")) {
      return new Response(JSON.stringify({ settled: true, txHash: "0xtestsettlement" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    return previousFetch(input, init);
  }) as typeof fetch;

  const app = await createServer();
  const headers = createTestAuthHeaders();
  t.after(async () => {
    globalThis.fetch = previousFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/trade/quote",
    headers: {
      ...headers,
      "content-type": "application/json"
    },
    payload: {
      tokenIn: "0x760afe86e5de5fa0ee542fc7b7b713e1c5425701",
      tokenOut: "0x62534e4bbd6d9ebac0ac99aeaa0aa48e56372df0",
      amountIn: "1"
    }
  });

  assert.equal(response.statusCode, 402);
  const body = response.json();
  assert.equal(body.x402Version, 1);
  assert.equal(body.scheme, "gokite-aa");
  assert.equal(typeof body.paymentRequestId, "string");
});

test("POST /trade/execute returns 403 when server signing is disabled", async (t) => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.includes("/v2/verify")) {
      return new Response(JSON.stringify({ valid: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    if (url.includes("/v2/settle")) {
      return new Response(JSON.stringify({ settled: true, txHash: "0xtestsettlement" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    return previousFetch(input, init);
  }) as typeof fetch;

  const app = await createServer();
  const headers = createTestAuthHeaders();
  t.after(async () => {
    globalThis.fetch = previousFetch;
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/trade/execute",
    headers: {
      ...headers,
      "content-type": "application/json"
    },
    payload: {
      quoteResponse: { requestId: "test-quote-id" }
    }
  });

  assert.equal(response.statusCode, 403);
  const body = response.json();
  assert.equal(body.code, "SERVER_SIGNING_DISABLED");
});

test("GET /trade/supported-chains includes dual-mode metadata", async (t) => {
  process.env.FACILITATOR_MODE = "demo";
  const app = await createServer();
  t.after(async () => {
    delete process.env.FACILITATOR_MODE;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/trade/supported-chains"
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.executionMode, "auto");
  assert.equal(body.effectiveModeByChain["143"], "live");
  assert.equal(body.effectiveModeByChain["10143"], "simulated");
  assert.equal(typeof body.defaultTradePair?.tokenIn, "string");
  assert.equal(typeof body.defaultTradePair?.tokenOut, "string");
});

test("POST /trade/quote uses simulated mode for chainId 10143 in auto mode", async (t) => {
  process.env.FACILITATOR_MODE = "demo";
  const app = await createServer();
  t.after(async () => {
    delete process.env.FACILITATOR_MODE;
    await app.close();
  });

  const challengeRes = await app.inject({
    method: "POST",
    url: "/trade/quote",
    headers: {
      ...createTestAuthHeaders(),
      "content-type": "application/json"
    },
    payload: {
      chainId: 10143,
      tokenIn: "0x0000000000000000000000000000000000000000",
      tokenOut: "0x760afe86e5de5fa0ee542fc7b7b713e1c5425701",
      amountIn: "1000000000000000000",
      intent: "swap",
      routingType: "WRAP"
    }
  });

  assert.equal(challengeRes.statusCode, 402);
  const challenge = challengeRes.json();
  const xPayment = JSON.stringify({
    paymentPayload: {
      scheme: challenge.scheme ?? "exact",
      network: challenge.network ?? "eip155:2368",
      authorization: {
        payer: "0xTestPayer",
        payee: challenge.payTo,
        amount: challenge.maxAmountRequired
      },
      signature: "0xdemo_signature"
    },
    paymentRequirements: challenge
  });

  const quoteRes = await app.inject({
    method: "POST",
    url: "/trade/quote",
    headers: {
      ...createTestAuthHeaders(),
      "content-type": "application/json",
      "x-payment": xPayment,
      "x-payment-request-id": challenge.paymentRequestId
    },
    payload: {
      chainId: 10143,
      tokenIn: "0x0000000000000000000000000000000000000000",
      tokenOut: "0x760afe86e5de5fa0ee542fc7b7b713e1c5425701",
      amountIn: "1000000000000000000",
      intent: "swap",
      routingType: "WRAP"
    }
  });

  assert.equal(quoteRes.statusCode, 200);
  const body = quoteRes.json();
  assert.equal(body.simulation?.enabled, true);
  assert.equal(body.simulation?.chainId, 10143);
  assert.equal(typeof body.quote, "object");
});

test("POST /trade/execute fails when strict attestation is not configured in live mode", async (t) => {
  process.env.FACILITATOR_MODE = "demo";
  process.env.SWAP_EXECUTION_MODE = "live";
  process.env.EXECUTION_CHAIN_ID = "143";
  process.env.ALLOW_SERVER_SIGNING = "true";
  process.env.UNISWAP_API_KEY = "test-uniswap-key";
  process.env.AGENT_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945382f4ff449bbf44e0f8c4f3fcbf7f0f6b0f";
  process.env.EXECUTION_RPC_URL = "http://127.0.0.1:8545";
  delete process.env.KITE_RPC_URL;
  delete process.env.SERVICE_REGISTRY_ADDRESS;

  const app = await createServer();
  t.after(async () => {
    delete process.env.FACILITATOR_MODE;
    delete process.env.SWAP_EXECUTION_MODE;
    delete process.env.EXECUTION_CHAIN_ID;
    delete process.env.ALLOW_SERVER_SIGNING;
    delete process.env.UNISWAP_API_KEY;
    delete process.env.AGENT_PRIVATE_KEY;
    delete process.env.EXECUTION_RPC_URL;
    await app.close();
  });

  const challengeRes = await app.inject({
    method: "POST",
    url: "/trade/execute",
    headers: {
      ...createTestAuthHeaders(),
      "content-type": "application/json"
    },
    payload: {
      chainId: 143,
      quoteResponse: { requestId: "quote-143" }
    }
  });
  assert.equal(challengeRes.statusCode, 402);
  const challenge = challengeRes.json();

  const xPayment = JSON.stringify({
    paymentPayload: {
      scheme: challenge.scheme ?? "exact",
      network: challenge.network ?? "eip155:2368",
      authorization: {
        payer: "0xTestPayer",
        payee: challenge.payTo,
        amount: challenge.maxAmountRequired
      },
      signature: "0xdemo_signature"
    },
    paymentRequirements: challenge
  });

  const response = await app.inject({
    method: "POST",
    url: "/trade/execute",
    headers: {
      ...createTestAuthHeaders(),
      "content-type": "application/json",
      "x-payment": xPayment,
      "x-payment-request-id": challenge.paymentRequestId
    },
    payload: {
      chainId: 143,
      quoteResponse: { requestId: "quote-143" }
    }
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().code, "ATTESTATION_NOT_CONFIGURED");
});
