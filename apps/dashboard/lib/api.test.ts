import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeAgentIdFromToken, fetchHealth } from "./api.js";

test("decodeAgentIdFromToken decodes JWT payload agentId", () => {
  const payload = Buffer.from(JSON.stringify({ agentId: "agent-123" }), "utf-8").toString("base64url");
  const token = `header.${payload}.sig`;
  assert.equal(decodeAgentIdFromToken(token), "agent-123");
});

test("fetchHealth returns parsed health payload", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        status: "ok",
        service: "api",
        timestamp: new Date().toISOString(),
        dependencies: { database: "up", paymentProviderMode: "mock", authMode: "dev" }
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    )) as typeof fetch;

  try {
    const health = await fetchHealth();
    assert.equal(health.status, "ok");
    const dependencies = health.dependencies as Record<string, unknown> | undefined;
    assert.equal(dependencies?.paymentProviderMode, "mock");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
