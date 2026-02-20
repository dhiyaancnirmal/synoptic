import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../server.js";
import { createTestAuthHeaders } from "./test-auth.js";

test("activity route supports list", async (t) => {
  const app = await createServer();
  t.after(async () => {
    await app.close();
  });

  const list = await app.inject({
    method: "GET",
    url: "/api/activity",
    headers: createTestAuthHeaders()
  });
  assert.equal(list.statusCode, 200);
  assert.ok(Array.isArray(list.json().data.events));
});
