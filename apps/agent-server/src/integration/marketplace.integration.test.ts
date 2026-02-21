import assert from "node:assert/strict";
import test from "node:test";
import { Wallet } from "ethers";
import { createServer } from "../server.js";

async function authenticateAndLink(app: Awaited<ReturnType<typeof createServer>>) {
  const owner = Wallet.createRandom();
  const payer = Wallet.createRandom();

  const challenge = await app.inject({
    method: "POST",
    url: "/api/auth/wallet/challenge",
    payload: { ownerAddress: owner.address }
  });
  const challengePayload = challenge.json() as {
    challengeId: string;
    message: string;
    ownerAddress: string;
  };

  const signature = await owner.signMessage(challengePayload.message);
  const verify = await app.inject({
    method: "POST",
    url: "/api/auth/wallet/verify",
    payload: {
      challengeId: challengePayload.challengeId,
      message: challengePayload.message,
      signature,
      ownerAddress: challengePayload.ownerAddress
    }
  });

  const auth = verify.json() as { accessToken: string };
  const headers = { authorization: `Bearer ${auth.accessToken}` };

  const linked = await app.inject({
    method: "POST",
    url: "/api/identity/link",
    headers,
    payload: { payerAddress: payer.address }
  });
  assert.equal(linked.statusCode, 200);

  return { headers, payerAddress: payer.address.toLowerCase() };
}

function buildXPayment(input: {
  challenge: Record<string, unknown>;
  payerAddress: string;
}): string {
  return JSON.stringify({
    paymentPayload: {
      scheme: "gokite-aa",
      network: "kite-testnet",
      x402Version: 1,
      payload: {
        authorization: {
          from: input.payerAddress,
          to: String(input.challenge.payTo ?? "0x66ad7ef70cc88e37fa692d85c8a55ed4c1493251"),
          token: String(input.challenge.asset ?? "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63"),
          value: String(input.challenge.maxAmountRequired ?? "1"),
          validAfter: "0",
          validBefore: "9999999999",
          nonce: "0xmarket"
        },
        signature: "0xdemo_signature",
        sessionId: "session-market",
        metadata: {}
      }
    },
    paymentRequirements: input.challenge
  });
}

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

  const { headers } = await authenticateAndLink(app);

  const response = await app.inject({
    method: "GET",
    url: "/marketplace/products/monad_block_summary/preview",
    headers
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

  const { headers } = await authenticateAndLink(app);

  const response = await app.inject({
    method: "GET",
    url: "/marketplace/products/invalid_sku/preview",
    headers
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

  const { headers } = await authenticateAndLink(app);

  const response = await app.inject({
    method: "POST",
    url: "/marketplace/products/monad_transfer_feed/purchase",
    headers: { ...headers, "content-type": "application/json" },
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

  const { headers, payerAddress } = await authenticateAndLink(app);

  const challengeRes = await app.inject({
    method: "POST",
    url: "/marketplace/products/monad_block_summary/purchase",
    headers: { ...headers, "content-type": "application/json" },
    payload: {}
  });
  assert.equal(challengeRes.statusCode, 402);
  const challenge = challengeRes.json() as Record<string, unknown>;

  const xPayment = buildXPayment({ challenge, payerAddress });

  const purchaseRes = await app.inject({
    method: "POST",
    url: "/marketplace/products/monad_block_summary/purchase",
    headers: {
      ...headers,
      "content-type": "application/json",
      "x-payment": xPayment,
      "x-payment-request-id": String(challenge.paymentRequestId)
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

  const { headers } = await authenticateAndLink(app);

  const response = await app.inject({
    method: "POST",
    url: "/marketplace/products/nonexistent/purchase",
    headers: { ...headers, "content-type": "application/json" },
    payload: {}
  });

  assert.equal(response.statusCode, 404);
});
