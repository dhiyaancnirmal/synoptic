import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../server.js";

test("local auth bypass allows loopback requests without bearer token when enabled", async (t) => {
  const previous = process.env.ALLOW_INSECURE_DEV_AUTH_BYPASS;
  process.env.ALLOW_INSECURE_DEV_AUTH_BYPASS = "true";

  const app = await createServer();
  t.after(async () => {
    await app.close();
    if (previous === undefined) {
      delete process.env.ALLOW_INSECURE_DEV_AUTH_BYPASS;
    } else {
      process.env.ALLOW_INSECURE_DEV_AUTH_BYPASS = previous;
    }
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/agents"
  });

  assert.equal(response.statusCode, 200);
});

test("local auth bypass still denies non-local origins", async (t) => {
  const previous = process.env.ALLOW_INSECURE_DEV_AUTH_BYPASS;
  process.env.ALLOW_INSECURE_DEV_AUTH_BYPASS = "true";

  const app = await createServer();
  t.after(async () => {
    await app.close();
    if (previous === undefined) {
      delete process.env.ALLOW_INSECURE_DEV_AUTH_BYPASS;
    } else {
      process.env.ALLOW_INSECURE_DEV_AUTH_BYPASS = previous;
    }
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/agents",
    headers: {
      origin: "https://example.com"
    }
  });

  assert.equal(response.statusCode, 401);
});
