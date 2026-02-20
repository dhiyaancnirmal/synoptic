import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../server.js";

test("cors preflight allows localhost dev origins across ports", async (t) => {
  const app = await createServer();
  t.after(async () => {
    await app.close();
  });

  const preflight = await app.inject({
    method: "OPTIONS",
    url: "/api/agents",
    headers: {
      origin: "http://localhost:5173",
      "access-control-request-method": "GET"
    }
  });

  assert.equal(preflight.statusCode, 204);
  assert.equal(preflight.headers["access-control-allow-origin"], "http://localhost:5173");
});

test("cors handles bare OPTIONS from local 127.0.0.1 origin", async (t) => {
  const app = await createServer();
  t.after(async () => {
    await app.close();
  });

  const options = await app.inject({
    method: "OPTIONS",
    url: "/api/agents",
    headers: {
      origin: "http://127.0.0.1:3230"
    }
  });

  assert.equal(options.statusCode, 204);
  assert.equal(options.headers["access-control-allow-origin"], "http://127.0.0.1:3230");
});
