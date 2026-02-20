import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../server.js";
import { createTestAuthHeaders } from "./test-auth.js";

test("GET /api/agents/:agentId/holdings returns holdings payload shape", async (t) => {
  const app = await createServer();
  const headers = createTestAuthHeaders();
  t.after(async () => {
    await app.close();
  });

  const agents = await app.inject({ method: "GET", url: "/api/agents", headers });
  const agentId = agents.json().data.agents[0]?.id as string;
  assert.ok(agentId);

  const response = await app.inject({
    method: "GET",
    url: `/api/agents/${agentId}/holdings`,
    headers
  });
  assert.equal(response.statusCode, 200);

  const payload = response.json();
  assert.equal(payload.code, "OK");
  assert.equal(payload.data.agentId, agentId);
  assert.ok(payload.data.asOf);
  assert.ok(payload.data.chainId);
  assert.ok(payload.data.chain);
  assert.ok(payload.data.walletAddress);
  assert.ok(Array.isArray(payload.data.holdings));
  assert.ok(typeof payload.data.totals);
});

test("GET /api/agents/:agentId/holdings returns 401 without auth", async (t) => {
  const app = await createServer();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({ method: "GET", url: "/api/agents/agent-test/holdings" });
  assert.equal(response.statusCode, 401);
});

test("GET /api/agents/:agentId/holdings returns 404 for unknown agent", async (t) => {
  const app = await createServer();
  const headers = createTestAuthHeaders();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/agents/non-existent-agent/holdings",
    headers
  });
  assert.equal(response.statusCode, 404);
  assert.equal(response.json().code, "NOT_FOUND");
});

test("GET /api/agents/:agentId/holdings returns 200 with empty holdings when agent has no wallet", async (t) => {
  const app = await createServer();
  const headers = createTestAuthHeaders();
  t.after(async () => {
    await app.close();
  });

  const created = await app.inject({
    method: "POST",
    url: "/api/agents",
    headers,
    payload: { name: "no-wallet-agent", eoaAddress: "0x0000000000000000000000000000000000000000" }
  });
  const agentId = created.json().data.agent.id as string;

  const response = await app.inject({
    method: "GET",
    url: `/api/agents/${agentId}/holdings`,
    headers
  });
  assert.equal(response.statusCode, 200);

  const payload = response.json();
  assert.equal(payload.code, "OK");
  assert.deepEqual(payload.data.holdings, []);
  assert.equal(payload.data.walletAddress, "0x0000000000000000000000000000000000000000");
});

test("GET /api/agents/:agentId/holdings returns 200 with warnings when RPC unavailable", async (t) => {
  const app = await createServer();
  const headers = createTestAuthHeaders();
  t.after(async () => {
    await app.close();
  });

  const agents = await app.inject({ method: "GET", url: "/api/agents", headers });
  const agentId = agents.json().data.agents[0]?.id as string;

  const response = await app.inject({
    method: "GET",
    url: `/api/agents/${agentId}/holdings`,
    headers
  });
  assert.equal(response.statusCode, 200);

  const payload = response.json();
  assert.equal(payload.code, "OK");
  assert.ok(payload.data.warnings);
  assert.ok(Array.isArray(payload.data.warnings));
  assert.ok(payload.data.warnings.length > 0);
  assert.ok(payload.data.warnings[0].includes("RPC not configured"));
});
