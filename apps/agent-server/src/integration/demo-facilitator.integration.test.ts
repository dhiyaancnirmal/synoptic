import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../server.js";

test("GET /health reports facilitator mode as demo when FACILITATOR_MODE=demo", async (t) => {
  process.env.FACILITATOR_MODE = "demo";
  const app = await createServer();
  t.after(async () => {
    delete process.env.FACILITATOR_MODE;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.dependencies.facilitator, "demo");
});

test("GET /health reports facilitator mode as real when FACILITATOR_MODE is unset and URL is set", async (t) => {
  delete process.env.FACILITATOR_MODE;
  process.env.KITE_FACILITATOR_URL = "https://facilitator.pieverse.io";
  const app = await createServer();
  t.after(async () => {
    delete process.env.KITE_FACILITATOR_URL;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.dependencies.facilitator, "real");
});

test("oracle /oracle/price returns 402 challenge in demo mode", async (t) => {
  process.env.FACILITATOR_MODE = "demo";
  const app = await createServer();
  t.after(async () => {
    delete process.env.FACILITATOR_MODE;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/oracle/price?pair=ETH/USDT"
  });

  assert.equal(response.statusCode, 402);
  const body = response.json();
  assert.equal(body.message, "Payment required");
  assert.ok(body.paymentRequestId);
  assert.ok(body.accepts);
});

test("oracle /oracle/price with x-payment succeeds in demo mode", async (t) => {
  process.env.FACILITATOR_MODE = "demo";
  const app = await createServer();
  t.after(async () => {
    delete process.env.FACILITATOR_MODE;
    await app.close();
  });

  // Get 402 challenge first
  const challengeRes = await app.inject({
    method: "GET",
    url: "/oracle/price?pair=ETH/USDT"
  });
  assert.equal(challengeRes.statusCode, 402);
  const challenge = challengeRes.json();

  // Send with x-payment
  const xPayment = JSON.stringify({
    paymentPayload: {
      scheme: "exact",
      network: "eip155:2368",
      authorization: { payer: "0xtest", amount: challenge.maxAmountRequired },
      signature: "0xdemo"
    },
    paymentRequirements: challenge
  });

  const priceRes = await app.inject({
    method: "GET",
    url: "/oracle/price?pair=ETH/USDT",
    headers: {
      "x-payment": xPayment,
      "x-payment-request-id": challenge.paymentRequestId
    }
  });

  assert.equal(priceRes.statusCode, 200);
  const priceBody = priceRes.json();
  assert.equal(priceBody.pair, "ETH/USDT");
  assert.ok(typeof priceBody.price === "number");
  assert.ok(priceBody.price > 0);
});
