import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../server.js";
import { createTestAuthHeaders } from "./test-auth.js";

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
    if (url.includes("api.coingecko.com")) {
      return new Response(JSON.stringify({ ethereum: { usd: 3210.12 } }), {
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

  const agents = await app.inject({ method: "GET", url: "/api/agents", headers });
  const agentId = agents.json().data.agents[0]?.id as string;
  assert.ok(agentId);

  const challenged = await app.inject({
    method: "GET",
    url: "/oracle/price?pair=eth/usdt",
    headers
  });
  assert.equal(challenged.statusCode, 402);
  const challengePayload = challenged.json();
  assert.equal(challengePayload.x402Version, 1);
  assert.equal(challengePayload.scheme, "gokite-aa");
  assert.equal(typeof challengePayload.paymentRequestId, "string");

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
      return new Response(JSON.stringify({ ethereum: { usd: 3210.12 } }), {
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
  const paymentRequestId = challenge.json().paymentRequestId as string;
  assert.ok(paymentRequestId);

  const blocked = await app.inject({
    method: "GET",
    url: `/oracle/price?pair=eth/usdt&agentId=${agentId}`,
    headers: {
      ...headers,
      "x-payment": JSON.stringify({ paymentRequestId }),
      "x-payment-request-id": paymentRequestId
    }
  });
  assert.equal(blocked.statusCode, 200);

  const payment = await app.inject({ method: "GET", url: `/api/payments/${paymentRequestId}`, headers });
  assert.equal(payment.statusCode, 200);
  assert.equal(payment.json().data.payment.status, "settled");
});
