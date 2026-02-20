import assert from "node:assert/strict";
import test from "node:test";
import { Wallet } from "ethers";
import { createServer } from "../server.js";
import { createTestAuthHeaders } from "./test-auth.js";

test("compat routes remain dashboard-compatible", async (t) => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const body = typeof init?.body === "string" ? init.body : "";
    if (
      init?.method === "POST" &&
      body.includes("\"method\":\"eth_chainId\"")
    ) {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: "0x940"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    return previousFetch(input, init);
  }) as typeof fetch;

  const app = await createServer();
  const headers = createTestAuthHeaders();
  t.after(async () => {
    globalThis.fetch = previousFetch;
    await app.close();
  });

  const owner = new Wallet("0x59c6995e998f97a5a0044966f0945380f2fbe6f7f0f5a5f97f79ea57004a3f27");
  const created = await app.inject({
    method: "POST",
    url: "/api/agents",
    headers,
    payload: {
      name: "compat-owned-agent",
      eoaAddress: owner.address
    }
  });
  assert.equal(created.statusCode, 200);
  const createdAgentId = created.json().data.agent.id as string;
  assert.ok(createdAgentId);

  const agents = await app.inject({ method: "GET", url: "/agents", headers });
  assert.equal(agents.statusCode, 200);
  const listed = agents.json().agents as Array<{ agentId: string }>;
  assert.ok(Array.isArray(listed));
  assert.ok(listed.length > 0);
  const agentId = createdAgentId;
  assert.ok(agentId);

  const getAgent = await app.inject({ method: "GET", url: `/agents/${agentId}`, headers });
  assert.equal(getAgent.statusCode, 200);
  assert.equal(getAgent.json().agent.agentId, agentId);

  const challenge = await app.inject({
    method: "POST",
    url: "/auth/siwe/challenge",
    payload: { agentId, ownerAddress: owner.address }
  });
  assert.equal(challenge.statusCode, 200);
  const challengePayload = challenge.json() as { challengeId: string; message: string };

  const signature = await owner.signMessage(challengePayload.message);
  const verify = await app.inject({
    method: "POST",
    url: "/auth/siwe/verify",
    payload: {
      challengeId: challengePayload.challengeId,
      message: challengePayload.message,
      signature,
      ownerAddress: owner.address,
      agentId
    }
  });
  assert.equal(verify.statusCode, 200);
  assert.equal(typeof verify.json().token, "string");

  const events = await app.inject({ method: "GET", url: `/events?agentId=${agentId}`, headers });
  assert.equal(events.statusCode, 200);
  assert.ok(Array.isArray(events.json().events));

  const quote = await app.inject({
    method: "POST",
    url: "/markets/quote",
    headers,
    payload: { agentId, side: "BUY", size: "1", marketId: "ETH-USDC" }
  });
  if (quote.statusCode === 503) {
    assert.equal(quote.json().code, "TRADING_NOT_CONFIGURED");
    return;
  }
  assert.equal(quote.statusCode, 200);
  assert.equal(typeof quote.json().quoteId, "string");

  const execute = await app.inject({
    method: "POST",
    url: "/markets/execute",
    headers,
    payload: { agentId, side: "BUY", size: "1", marketId: "ETH-USDC" }
  });
  assert.equal(execute.statusCode, 200);
  const orderId = execute.json().order.orderId as string;
  assert.ok(orderId);

  const order = await app.inject({ method: "GET", url: `/orders/${orderId}`, headers });
  assert.equal(order.statusCode, 200);
  assert.equal(order.json().order.orderId, orderId);
});
