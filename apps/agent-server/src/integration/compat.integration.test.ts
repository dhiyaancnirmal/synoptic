import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../server.js";
import { createTestAuthHeaders } from "./test-auth.js";

test("legacy compat routes are disabled", async (t) => {
  const app = await createServer();
  const headers = createTestAuthHeaders();
  t.after(async () => {
    await app.close();
  });

  const checks = await Promise.all([
    app.inject({ method: "GET", url: "/agents", headers }),
    app.inject({ method: "GET", url: "/agents/agent-1", headers }),
    app.inject({ method: "GET", url: "/events", headers }),
    app.inject({ method: "GET", url: "/orders/order-1", headers }),
    app.inject({
      method: "POST",
      url: "/markets/quote",
      headers,
      payload: { agentId: "agent-1", side: "BUY", size: "1", marketId: "ETH-USDC" }
    }),
    app.inject({
      method: "POST",
      url: "/markets/execute",
      headers,
      payload: { agentId: "agent-1", side: "BUY", size: "1", marketId: "ETH-USDC" }
    })
  ]);

  for (const response of checks) {
    assert.equal(response.statusCode, 404);
  }
});
