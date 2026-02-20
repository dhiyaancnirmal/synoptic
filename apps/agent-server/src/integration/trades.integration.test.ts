import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../server.js";
import { createTestAuthHeaders } from "./test-auth.js";

test("trade routes support list/get", async (t) => {
  const app = await createServer();
  const headers = createTestAuthHeaders();
  t.after(async () => {
    await app.close();
  });

  const list = await app.inject({ method: "GET", url: "/api/trades", headers });
  assert.equal(list.statusCode, 200);
  assert.ok(Array.isArray(list.json().data.trades));

  const getById = await app.inject({ method: "GET", url: "/api/trades/trade-1", headers });
  assert.equal(getById.statusCode, 404);
  assert.equal(getById.json().code, "NOT_FOUND");
});
