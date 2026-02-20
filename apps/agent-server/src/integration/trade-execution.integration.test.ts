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

test("POST /trade/execute returns 402 without x-payment header", async (t) => {
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

  assert.equal(response.statusCode, 402);
  const body = response.json();
  assert.equal(body.x402Version, 1);
  assert.equal(body.scheme, "gokite-aa");
  assert.equal(typeof body.paymentRequestId, "string");
});
