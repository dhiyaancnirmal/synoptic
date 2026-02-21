import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../server.js";

const SECURITY_TOKEN = "qn-test-token-12345";

test("GET /webhooks/quicknode/monad returns health check", async (t) => {
  process.env.QUICKNODE_SECURITY_TOKEN = SECURITY_TOKEN;
  const app = await createServer();
  t.after(async () => {
    delete process.env.QUICKNODE_SECURITY_TOKEN;
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/webhooks/quicknode/monad"
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.provider, "quicknode");
  assert.equal(body.network, "monad-testnet");
});

test("POST /webhooks/quicknode/monad with valid token and block data returns 200", async (t) => {
  process.env.QUICKNODE_SECURITY_TOKEN = SECURITY_TOKEN;
  const app = await createServer();
  t.after(async () => {
    delete process.env.QUICKNODE_SECURITY_TOKEN;
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/webhooks/quicknode/monad",
    headers: {
      "x-quicknode-token": SECURITY_TOKEN,
      "content-type": "application/json"
    },
    payload: {
      data: [
        {
          number: "0x1a4",
          hash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
          parentHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          timestamp: "0x65a1b2c3"
        }
      ]
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.received, true);
  assert.equal(body.blocksProcessed, 1);
  assert.equal(body.lastBlockNumber, 420);
});

test("POST /webhooks/quicknode/monad with invalid token returns 401", async (t) => {
  process.env.QUICKNODE_SECURITY_TOKEN = SECURITY_TOKEN;
  const app = await createServer();
  t.after(async () => {
    delete process.env.QUICKNODE_SECURITY_TOKEN;
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/webhooks/quicknode/monad",
    headers: {
      "x-quicknode-token": "wrong-token",
      "content-type": "application/json"
    },
    payload: { data: [] }
  });

  assert.equal(response.statusCode, 401);
  const body = response.json();
  assert.equal(body.code, "QUICKNODE_UNAUTHORIZED");
});

test("POST /webhooks/quicknode/monad with empty body returns 200", async (t) => {
  process.env.QUICKNODE_SECURITY_TOKEN = SECURITY_TOKEN;
  const app = await createServer();
  t.after(async () => {
    delete process.env.QUICKNODE_SECURITY_TOKEN;
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/webhooks/quicknode/monad",
    headers: {
      "x-quicknode-token": SECURITY_TOKEN,
      "content-type": "application/json"
    },
    payload: {}
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.received, true);
});
