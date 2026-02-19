import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { createX402Middleware } from "./x402.js";
import type { ApiContext } from "../context.js";
import { ApiError } from "../utils/errors.js";

function buildContext(overrides?: { processPayment?: () => Promise<{ settlementId: string; status: "SETTLED"; txHash?: string }> }) {
  return {
    paymentService: {
      createRequirement: () => ({ network: "2368", asset: "0xasset", amount: "0.10", payTo: "synoptic" }),
      processPayment:
        overrides?.processPayment ??
        (async () => ({
          settlementId: "set-1",
          status: "SETTLED" as const,
          txHash: "0xabc"
        }))
    },
    prisma: {
      event: {
        create: async () => ({})
      }
    },
    io: {
      emit: () => undefined
    }
  } as const;
}

test("x402 middleware returns challenge when header missing", async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = { agentId: "agent-1", ownerAddress: "0xabc", scopes: [] };
    req.requestId = "req-1";
    next();
  });
  app.post("/paid", createX402Middleware(buildContext() as unknown as ApiContext, "/paid"), (_req, res) => {
    res.json({ ok: true });
  });

  const res = await request(app).post("/paid").send({});
  assert.equal(res.status, 402);
  assert.equal(res.body.code, "PAYMENT_REQUIRED");
});

test("x402 middleware continues when payment succeeds", async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = { agentId: "agent-1", ownerAddress: "0xabc", scopes: [] };
    req.requestId = "req-2";
    next();
  });
  app.post("/paid", createX402Middleware(buildContext() as unknown as ApiContext, "/paid"), (req, res) => {
    res.json({ settlementId: req.paymentSettlement?.settlementId });
  });

  const res = await request(app).post("/paid").set("x-payment", "header").send({});
  assert.equal(res.status, 200);
  assert.equal(res.body.settlementId, "set-1");
});

test("x402 middleware returns challenge on invalid payment", async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = { agentId: "agent-1", ownerAddress: "0xabc", scopes: [] };
    req.requestId = "req-3";
    next();
  });
  app.post(
    "/paid",
    createX402Middleware(
      buildContext({
        processPayment: async () => {
          throw new ApiError("INVALID_PAYMENT", 402, "invalid");
        }
      }) as unknown as ApiContext,
      "/paid"
    ),
    (_req, res) => {
      res.json({ ok: true });
    }
  );

  const res = await request(app).post("/paid").set("x-payment", "header").send({});
  assert.equal(res.status, 402);
  assert.equal(res.body.code, "PAYMENT_REQUIRED");
});
