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

  const auth = verify.json() as { accessToken: string; agentId: string };
  const headers = { authorization: `Bearer ${auth.accessToken}` };

  const linked = await app.inject({
    method: "POST",
    url: "/api/identity/link",
    headers,
    payload: { payerAddress: payer.address }
  });
  assert.equal(linked.statusCode, 200);

  return {
    headers,
    payerAddress: payer.address.toLowerCase(),
    agentId: auth.agentId
  };
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
          nonce: "0xoracle"
        },
        signature: "0xtest",
        sessionId: "session-oracle",
        metadata: {}
      }
    },
    paymentRequirements: input.challenge
  });
}

test("oracle route uses Uniswap quote when UNISWAP_API_KEY is configured", async (t) => {
  const previousFetch = globalThis.fetch;
  const previousUniswapApiKey = process.env.UNISWAP_API_KEY;
  process.env.UNISWAP_API_KEY = "uniswap-test-key";

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
    if (url.includes("trade-api.gateway.uniswap.org/v1/quote")) {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("x-api-key"), "uniswap-test-key");
      return new Response(
        JSON.stringify({
          requestId: "uniswap-quote-1",
          quote: {
            output: {
              amount: "3210123456"
            }
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    }
    return previousFetch(input, init);
  }) as typeof fetch;

  const app = await createServer();
  const headers = createTestAuthHeaders();
  t.after(async () => {
    globalThis.fetch = previousFetch;
    if (previousUniswapApiKey === undefined) {
      delete process.env.UNISWAP_API_KEY;
    } else {
      process.env.UNISWAP_API_KEY = previousUniswapApiKey;
    }
    await app.close();
  });

  const challenged = await app.inject({
    method: "GET",
    url: "/oracle/price?pair=eth/usdt",
    headers
  });
  assert.equal(challenged.statusCode, 402);
  const challengePayload = challenged.json();

  const paid = await app.inject({
    method: "GET",
    url: "/oracle/price?pair=eth/usdt",
    headers: {
      ...headers,
      "x-payment": JSON.stringify({ paymentRequestId: challengePayload.paymentRequestId }),
      "x-payment-request-id": challengePayload.paymentRequestId
    }
  });
  assert.equal(paid.statusCode, 200);
  const paidPayload = paid.json();
  assert.equal(paidPayload.source, "uniswap");
  assert.equal(paidPayload.price, 3210.123456);
});

test("oracle route enforces challenge, settles deterministic payment, and persists payment lifecycle", async (t) => {
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
  t.after(async () => {
    globalThis.fetch = previousFetch;
    await app.close();
  });

  const { headers, payerAddress, agentId } = await authenticateAndLink(app);

  const challenged = await app.inject({
    method: "GET",
    url: "/oracle/price?pair=eth/usdt",
    headers
  });
  assert.equal(challenged.statusCode, 402);
  const challengePayload = challenged.json() as Record<string, unknown>;
  assert.equal(challengePayload.x402Version, 1);
  assert.equal(challengePayload.scheme, "gokite-aa");
  assert.equal(typeof challengePayload.paymentRequestId, "string");

  const paid = await app.inject({
    method: "GET",
    url: "/oracle/price?pair=eth/usdt",
    headers: {
      ...headers,
      "x-payment": buildXPayment({ challenge: challengePayload, payerAddress }),
      "x-payment-request-id": String(challengePayload.paymentRequestId)
    }
  });
  assert.equal(paid.statusCode, 200);
  const paidPayload = paid.json();
  assert.equal(paidPayload.pair, "ETH/USDT");
  assert.equal(typeof paidPayload.timestamp, "number");

  const payments = await app.inject({ method: "GET", url: "/api/payments", headers });
  assert.equal(payments.statusCode, 200);
  const ledger = payments.json().data.payments as Array<{ id: string; agentId: string; status: string }>;
  const settled = ledger.find((entry) => entry.id === challengePayload.paymentRequestId);
  assert.equal(settled?.agentId, agentId);
  assert.equal(settled?.status, "settled");

  const activity = await app.inject({ method: "GET", url: `/api/activity?agentId=${agentId}`, headers });
  assert.equal(activity.statusCode, 200);
  const events = activity.json().data.events as Array<{ eventType: string; data?: { paymentId?: string } }>;
  const scoped = events.filter((event) => event.data?.paymentId === challengePayload.paymentRequestId);
  assert.ok(scoped.some((event) => event.eventType === "payment.requested"));
  assert.ok(scoped.some((event) => event.eventType === "payment.authorized"));
  assert.ok(scoped.some((event) => event.eventType === "payment.settled"));
});

test("oracle route currently settles even when agent budget is low because local budget enforcement is disabled", async (t) => {
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
    await app.close();
  });

  const { headers, payerAddress } = await authenticateAndLink(app);

  const created = await app.inject({
    method: "POST",
    url: "/api/agents",
    headers,
    payload: { name: "tight-budget", dailyBudgetUsd: "0.10" }
  });
  const agentId = created.json().data.agent.id as string;
  assert.ok(agentId);

  const challenge = await app.inject({
    method: "GET",
    url: `/oracle/price?pair=eth/usdt&agentId=${agentId}`,
    headers
  });
  assert.equal(challenge.statusCode, 402);
  const challengeBody = challenge.json() as Record<string, unknown>;
  const paymentRequestId = String(challengeBody.paymentRequestId);
  assert.ok(paymentRequestId);

  const blocked = await app.inject({
    method: "GET",
    url: `/oracle/price?pair=eth/usdt&agentId=${agentId}`,
    headers: {
      ...headers,
      "x-payment": buildXPayment({ challenge: challengeBody, payerAddress }),
      "x-payment-request-id": paymentRequestId
    }
  });
  assert.equal(blocked.statusCode, 200);

  const payment = await app.inject({ method: "GET", url: `/api/payments/${paymentRequestId}`, headers });
  assert.equal(payment.statusCode, 200);
  assert.equal(payment.json().data.payment.status, "settled");
});
