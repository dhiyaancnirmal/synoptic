import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../server.js";
import { createTestAuthHeaders } from "./test-auth.js";

const EXPECTED_SKUS = [
  "monad_lp_range_signal",
  "monad_orderflow_imbalance",
  "monad_contract_momentum",
  "monad_selector_heatmap",
  "monad_launchpad_watch"
];

test("GET /marketplace/catalog returns new Streams-derived SKU set", async (t) => {
  process.env.FACILITATOR_MODE = "demo";
  const app = await createServer();
  t.after(async () => {
    delete process.env.FACILITATOR_MODE;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/marketplace/catalog"
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.ok(Array.isArray(body.catalog));
  assert.equal(body.catalog.length, EXPECTED_SKUS.length);

  const skus = body.catalog.map((item: { sku: string }) => item.sku);
  for (const sku of EXPECTED_SKUS) {
    assert.ok(skus.includes(sku));
  }

  for (const item of body.catalog) {
    assert.ok(typeof item.name === "string");
    assert.ok(typeof item.description === "string");
    assert.ok(typeof item.priceUsd === "number");
    assert.ok(typeof item.dataSource === "string");
    assert.ok(typeof item.category === "string");
    assert.ok(typeof item.refreshCadence === "string");
    assert.ok(typeof item.dataConfidence === "string");
    assert.ok(item.sampleSchema && typeof item.sampleSchema === "object");
  }
});

test("GET /marketplace/products/:sku/preview returns metadata and sample payload", async (t) => {
  process.env.FACILITATOR_MODE = "demo";
  const app = await createServer();
  t.after(async () => {
    delete process.env.FACILITATOR_MODE;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/marketplace/products/monad_lp_range_signal/preview?risk=0.6&preset=all"
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.sku, "monad_lp_range_signal");
  assert.equal(body.preview, true);
  assert.equal(body.category, "lp_intelligence");
  assert.ok(body.sampleSchema);
  assert.ok(Array.isArray(body.data));
});

test("GET /marketplace/products/:sku/preview validates params and chain support", async (t) => {
  process.env.FACILITATOR_MODE = "demo";
  const app = await createServer();
  t.after(async () => {
    delete process.env.FACILITATOR_MODE;
    await app.close();
  });

  const invalidParams = await app.inject({
    method: "GET",
    url: "/marketplace/products/monad_contract_momentum/preview?limit=0"
  });
  assert.equal(invalidParams.statusCode, 400);
  assert.equal(invalidParams.json().code, "SKU_PARAMS_INVALID");

  const unsupportedChain = await app.inject({
    method: "GET",
    url: "/marketplace/products/monad_selector_heatmap/preview?chainId=1"
  });
  assert.equal(unsupportedChain.statusCode, 400);
  assert.equal(unsupportedChain.json().code, "CHAIN_UNSUPPORTED");
});

test("POST /marketplace/products/:sku/purchase without payment returns 402", async (t) => {
  process.env.FACILITATOR_MODE = "demo";
  const app = await createServer();
  t.after(async () => {
    delete process.env.FACILITATOR_MODE;
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/marketplace/products/monad_orderflow_imbalance/purchase",
    headers: { ...createTestAuthHeaders(), "content-type": "application/json" },
    payload: {}
  });

  assert.equal(response.statusCode, 402);
  const body = response.json();
  assert.equal(body.message, "Payment required");
  assert.ok(body.paymentRequestId);
  assert.ok(body.accepts);
  assert.ok(Array.isArray(body.accepts));
  assert.equal(body.accepts[0]?.merchantName, "Synoptic Marketplace");
});

test("POST /marketplace/products/:sku/purchase with x-payment completes purchase (demo mode)", async (t) => {
  process.env.FACILITATOR_MODE = "demo";
  const app = await createServer();
  t.after(async () => {
    delete process.env.FACILITATOR_MODE;
    await app.close();
  });

  const challengeRes = await app.inject({
    method: "POST",
    url: "/marketplace/products/monad_selector_heatmap/purchase",
    headers: { ...createTestAuthHeaders(), "content-type": "application/json" },
    payload: { limit: 5 }
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

  const purchaseRes = await app.inject({
    method: "POST",
    url: "/marketplace/products/monad_selector_heatmap/purchase",
    headers: {
      ...createTestAuthHeaders(),
      "content-type": "application/json",
      "x-payment": xPayment,
      "x-payment-request-id": challenge.paymentRequestId
    },
    payload: { limit: 5 }
  });

  assert.equal(purchaseRes.statusCode, 200);
  const body = purchaseRes.json();
  assert.ok(body.purchaseId);
  assert.equal(body.sku, "monad_selector_heatmap");
  assert.ok(body.paymentId);
  assert.ok(body.settlementTxHash);
  assert.ok(body.attestationTxHash);
  assert.ok(body.resultHash);
  assert.ok(Array.isArray(body.data));
  assert.ok(body.timestamp);
  assert.equal(body.category, "signature_analytics");
  assert.equal(body.dataConfidence, "medium");
});

test("POST /marketplace/products/:sku/purchase validates SKU params", async (t) => {
  process.env.FACILITATOR_MODE = "demo";
  const app = await createServer();
  t.after(async () => {
    delete process.env.FACILITATOR_MODE;
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/marketplace/products/monad_lp_range_signal/purchase",
    headers: { ...createTestAuthHeaders(), "content-type": "application/json" },
    payload: { risk: 2 }
  });

  assert.equal(response.statusCode, 400);
  const body = response.json();
  assert.equal(body.code, "SKU_PARAMS_INVALID");
});

test("POST /marketplace/products/invalid_sku/purchase returns 404", async (t) => {
  process.env.FACILITATOR_MODE = "demo";
  const app = await createServer();
  t.after(async () => {
    delete process.env.FACILITATOR_MODE;
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/marketplace/products/nonexistent/purchase",
    headers: { ...createTestAuthHeaders(), "content-type": "application/json" },
    payload: {}
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().code, "SKU_NOT_FOUND");
});
