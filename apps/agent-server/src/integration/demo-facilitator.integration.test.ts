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
          nonce: "0xdemo"
        },
        signature: "0xdemo",
        sessionId: "session-demo",
        metadata: {}
      }
    },
    paymentRequirements: input.challenge
  });
}

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

test("GET /health reports facilitator mode as facilitator when FACILITATOR_MODE is unset and URL is set", async (t) => {
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
  assert.equal(body.dependencies.facilitator, "facilitator");
});

test("oracle /oracle/price returns 402 challenge in demo mode", async (t) => {
  process.env.FACILITATOR_MODE = "demo";
  const app = await createServer();
  t.after(async () => {
    delete process.env.FACILITATOR_MODE;
    await app.close();
  });

  const { headers } = await authenticateAndLink(app);

  const response = await app.inject({
    method: "GET",
    url: "/oracle/price?pair=ETH/USDT",
    headers
  });

  assert.equal(response.statusCode, 402);
  const body = response.json();
  assert.equal(body.message, "Payment required");
  assert.ok(body.paymentRequestId);
  assert.ok(body.accepts);
});

test("oracle /oracle/price with x-payment succeeds in demo mode", async (t) => {
  process.env.FACILITATOR_MODE = "demo";
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.includes("api.coingecko.com")) {
      return new Response(JSON.stringify({ ethereum: { usd: 3200 } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    return previousFetch(input, init);
  }) as typeof fetch;

  const app = await createServer();
  t.after(async () => {
    globalThis.fetch = previousFetch;
    delete process.env.FACILITATOR_MODE;
    await app.close();
  });

  const { headers, payerAddress } = await authenticateAndLink(app);

  const challengeRes = await app.inject({
    method: "GET",
    url: "/oracle/price?pair=ETH/USDT",
    headers
  });
  assert.equal(challengeRes.statusCode, 402);
  const challenge = challengeRes.json() as Record<string, unknown>;

  const xPayment = buildXPayment({ challenge, payerAddress });

  const priceRes = await app.inject({
    method: "GET",
    url: "/oracle/price?pair=ETH/USDT",
    headers: {
      ...headers,
      "x-payment": xPayment,
      "x-payment-request-id": String(challenge.paymentRequestId)
    }
  });

  assert.equal(priceRes.statusCode, 200);
  const priceBody = priceRes.json();
  assert.equal(priceBody.pair, "ETH/USDT");
  assert.ok(typeof priceBody.price === "number");
  assert.ok(priceBody.price > 0);
});
