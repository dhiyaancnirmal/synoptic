import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { requireAuth } from "./auth.js";

test("requireAuth rejects missing bearer token", async () => {
  const app = express();
  app.get("/private", requireAuth("test-secret-123456"), (_req, res) => {
    res.json({ ok: true });
  });

  const res = await request(app).get("/private");
  assert.equal(res.status, 401);
  assert.equal(res.body.code, "UNAUTHORIZED");
});

test("requireAuth accepts valid bearer token", async () => {
  const app = express();
  const token = jwt.sign(
    {
      agentId: "agent-1",
      ownerAddress: "0xabc",
      scopes: ["trade:execute"]
    },
    "test-secret-123456"
  );

  app.get("/private", requireAuth("test-secret-123456"), (req, res) => {
    res.json({ ok: true, agentId: req.auth?.agentId });
  });

  const res = await request(app).get("/private").set("authorization", `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.agentId, "agent-1");
});
