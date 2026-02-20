import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../server.js";

test("GET /health returns service health payload", async (t) => {
  const app = await createServer();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(payload.status, "ok");
  assert.equal(payload.service, "agent-server");
  assert.equal(typeof payload.timestamp, "string");
});
