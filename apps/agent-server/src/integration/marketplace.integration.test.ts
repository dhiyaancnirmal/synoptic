import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../server.js";

test("GET /marketplace/catalog returns 3 SKUs", async (t) => {
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
  assert.equal(body.catalog.length, 3);

  const skus = body.catalog.map((item: { sku: string }) => item.sku);
  assert.ok(skus.includes("monad_transfer_feed"));
  assert.ok(skus.includes("monad_contract_activity"));
  assert.ok(skus.includes("monad_block_summary"));

  for (const item of body.catalog) {
    assert.ok(typeof item.name === "string");
    assert.ok(typeof item.description === "string");
    assert.ok(typeof item.priceUsd === "number");
    assert.ok(typeof item.dataSource === "string");
  }
});

test("GET /marketplace/products/:sku/preview returns sample data", async (t) => {
  process.env.FACILITATOR_MODE = "demo";
  const app = await createServer();
  t.after(async () => {
    delete process.env.FACILITATOR_MODE;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/marketplace/products/monad_block_summary/preview"
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.sku, "monad_block_summary");
  assert.equal(body.preview, true);
  assert.ok(Array.isArray(body.data));
});

test("GET /marketplace/products/unknown_sku/preview returns 404", async (t) => {
  process.env.FACILITATOR_MODE = "demo";
  const app = await createServer();
  t.after(async () => {
    delete process.env.FACILITATOR_MODE;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/marketplace/products/invalid_sku/preview"
  });

  assert.equal(response.statusCode, 404);
  const body = response.json();
  assert.equal(body.code, "SKU_NOT_FOUND");
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
    url: "/marketplace/products/monad_transfer_feed/purchase",
    headers: { "content-type": "application/json" },
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

  // Step 1: get 402 challenge
  const challengeRes = await app.inject({
    method: "POST",
    url: "/marketplace/products/monad_block_summary/purchase",
    headers: { "content-type": "application/json" },
    payload: {}
  });
  assert.equal(challengeRes.statusCode, 402);
  const challenge = challengeRes.json();

  // Step 2: send payment
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
    url: "/marketplace/products/monad_block_summary/purchase",
    headers: {
      "content-type": "application/json",
      "x-payment": xPayment,
      "x-payment-request-id": challenge.paymentRequestId
    },
    payload: {}
  });

  assert.equal(purchaseRes.statusCode, 200);
  const body = purchaseRes.json();
  assert.ok(body.purchaseId);
  assert.equal(body.sku, "monad_block_summary");
  assert.ok(body.paymentId);
  assert.ok(body.settlementTxHash);
  assert.ok(body.settlementTxHash.startsWith("0xdemo_"));
  assert.ok(body.resultHash);
  assert.ok(Array.isArray(body.data));
  assert.ok(body.timestamp);
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
    headers: { "content-type": "application/json" },
    payload: {}
  });

  assert.equal(response.statusCode, 404);
});
