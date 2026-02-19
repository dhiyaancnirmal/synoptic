import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { after, before, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { createServer } from "node:http";
import request from "supertest";
import { Server as SocketIOServer } from "socket.io";
import type { SiweVerifyResponse } from "@synoptic/types/rest";
import { createApp } from "../app.js";
import type { ApiConfig } from "../config.js";
import { createPaymentService } from "../services/payment.js";
import { createShopifyCatalogService } from "../services/shopify-catalog.js";
import { createLogger } from "../utils/logger.js";
import { createInMemoryMetrics } from "../utils/metrics.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const hasDatabase = Boolean(databaseUrl);

if (!hasDatabase) {
  test("integration tests require TEST_DATABASE_URL or DATABASE_URL", { skip: true }, () => {});
} else {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl
      }
    }
  });

  const server = createServer();
  const io = new SocketIOServer(server, { cors: { origin: "*" } });

  const baseConfig: ApiConfig = {
    NODE_ENV: "test",
    PORT: 3001,
    AUTH_MODE: "dev",
    CORS_ORIGIN: "http://localhost:3000",
    DATABASE_URL: databaseUrl as string,
    KITE_RPC_URL: "https://rpc-testnet.gokite.ai/",
    KITE_CHAIN_ID: 2368,
    TRADING_MODE: "bridge_to_base_v1",
    BASE_SEPOLIA_RPC_URL: "https://sepolia.base.org",
    BASE_SEPOLIA_CHAIN_ID: 84532,
    BASE_UNISWAP_V3_FACTORY: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
    BASE_UNISWAP_V3_ROUTER: "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4",
    BASE_UNISWAP_QUOTER_V2: "0xC5290058841028F1614F3A6F0F5816cAd0df5E27",
    KITE_BRIDGE_ROUTER: "0x7777777777777777777777777777777777777777",
    KITE_TOKEN_ON_BASE: "0xFB9a6AF5C014c32414b4a6e208a89904c6dAe266",
    BUSDT_TOKEN_ON_BASE: "0xdAD5b9eB32831D54b7f2D8c92ef4E2A68008989C",
    KITE_TESTNET_USDT: "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63",
    SERVER_SIGNER_PRIVATE_KEY: "0x1111111111111111111111111111111111111111111111111111111111111111",
    BRIDGE_TIMEOUT_MS: 1_200_000,
    MAX_TRADE_NOTIONAL_BUSDT: 10,
    SLIPPAGE_BPS: 100,
    SWAP_DEADLINE_SECONDS: 300,
    SETTLEMENT_TOKEN_ADDRESS: "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63",
    JWT_SECRET: "integration-secret-12345",
    SHOPIFY_TIMEOUT_MS: 5000,
    PAYMENT_MODE: "mock",
    FACILITATOR_URL: "mock://facilitator",
    FACILITATOR_TIMEOUT_MS: 100,
    FACILITATOR_VERIFY_PATH: "/verify",
    FACILITATOR_SETTLE_PATH: "/settle",
    PAYMENT_RETRY_ATTEMPTS: 2,
    X402_PAY_TO: "synoptic-facilitator",
    X402_PRICE_USD: "0.10",
    PRICE_SOURCE: "deterministic"
  };

  const app = createApp({
    config: baseConfig,
    prisma,
    io,
    logger: createLogger("silent"),
    metrics: createInMemoryMetrics(),
    paymentService: createPaymentService({
      mode: baseConfig.PAYMENT_MODE,
      facilitatorUrl: baseConfig.FACILITATOR_URL ?? "mock://facilitator",
      verifyPath: baseConfig.FACILITATOR_VERIFY_PATH,
      settlePath: baseConfig.FACILITATOR_SETTLE_PATH,
      network: String(baseConfig.KITE_CHAIN_ID),
      asset: baseConfig.SETTLEMENT_TOKEN_ADDRESS,
      amount: baseConfig.X402_PRICE_USD,
      payTo: baseConfig.X402_PAY_TO,
      timeoutMs: baseConfig.FACILITATOR_TIMEOUT_MS,
      retries: baseConfig.PAYMENT_RETRY_ATTEMPTS
    }),
    shopifyCatalogService: createShopifyCatalogService(baseConfig)
  });

  const outageApp = createApp({
    config: {
      ...baseConfig,
      FACILITATOR_URL: "http://127.0.0.1:9"
    },
    prisma,
    io,
    logger: createLogger("silent"),
    metrics: createInMemoryMetrics(),
    paymentService: createPaymentService({
      mode: "http",
      facilitatorUrl: "http://127.0.0.1:9",
      verifyPath: "/verify",
      settlePath: "/settle",
      network: String(baseConfig.KITE_CHAIN_ID),
      asset: baseConfig.SETTLEMENT_TOKEN_ADDRESS,
      amount: baseConfig.X402_PRICE_USD,
      payTo: baseConfig.X402_PAY_TO,
      timeoutMs: 50,
      retries: 1
    }),
    shopifyCatalogService: createShopifyCatalogService(baseConfig)
  });

  let token = "";
  const agentId = `agent-${randomUUID()}`;

  function bearer(): Record<string, string> {
    return { authorization: `Bearer ${token}` };
  }

  function paymentHeader(signature = `sig_${randomUUID()}`): string {
    return Buffer.from(
      JSON.stringify({
        paymentId: randomUUID(),
        signature,
        amount: baseConfig.X402_PRICE_USD,
        asset: baseConfig.SETTLEMENT_TOKEN_ADDRESS,
        network: String(baseConfig.KITE_CHAIN_ID),
        payer: "integration-test"
      }),
      "utf-8"
    ).toString("base64url");
  }

  async function resetDb(): Promise<void> {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "Event", "ExecutionIntent", "Order", "Settlement", "IdempotencyKey", "RiskRule", "Agent" RESTART IDENTITY CASCADE;');
  }

  before(async () => {
    execSync("pnpm --filter @synoptic/api prisma:migrate:deploy", {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl
      },
      stdio: "pipe"
    });

    await resetDb();

    await request(app).post("/auth/siwe/challenge").send({ address: "0xabc" }).expect(200);

    const verify = await request(app)
      .post("/auth/siwe/verify")
      .send({
        message: "test-message",
        signature: "0xtest-signature",
        agentId,
        ownerAddress: "0xabc"
      })
      .expect(200);

    token = (verify.body as SiweVerifyResponse).token;

    await request(app).post("/agents").set(bearer()).send({ ownerAddress: "0xabc" }).expect(201);
  });

  after(async () => {
    await prisma.$disconnect();
    io.close();
  });

  test("agent create/list/get lifecycle", async () => {
    const list = await request(app).get("/agents").set(bearer()).expect(200);
    assert.equal(Array.isArray(list.body.agents), true);
    assert.equal(list.body.agents.some((agent: { agentId: string }) => agent.agentId === agentId), true);

    const detail = await request(app).get(`/agents/${agentId}`).set(bearer()).expect(200);
    assert.equal(detail.body.agent.agentId, agentId);
  });

  test("quote and execute happy path persist order + settlement + events", async () => {
    const quote = await request(app)
      .post("/markets/quote")
      .set(bearer())
      .set("x-payment", paymentHeader())
      .send({
        agentId,
        venueType: "SPOT",
        marketId: "KITE_bUSDT_BASE_SEPOLIA",
        side: "BUY",
        size: "1"
      })
      .expect(200);

    const execute = await request(app)
      .post("/markets/execute")
      .set(bearer())
      .set("x-payment", paymentHeader())
      .set("idempotency-key", `idem-${randomUUID()}`)
      .send({
        agentId,
        venueType: "SPOT",
        marketId: "KITE_bUSDT_BASE_SEPOLIA",
        side: "BUY",
        size: "1",
        quoteId: quote.body.quoteId
      })
      .expect(200);

    assert.equal(execute.body.order.status, "EXECUTED");
    assert.equal(execute.body.settlement.status, "SETTLED");

    const events = await request(app).get(`/events?agentId=${encodeURIComponent(agentId)}`).set(bearer()).expect(200);
    assert.equal(events.body.events.length > 0, true);
  });

  test("execute rejection paths for insufficient funds and risk limit", async () => {
    const insufficient = await request(app)
      .post("/markets/execute")
      .set(bearer())
      .set("x-payment", paymentHeader())
      .set("idempotency-key", `idem-${randomUUID()}`)
      .send({
        agentId,
        venueType: "SPOT",
        marketId: "KITE_bUSDT_BASE_SEPOLIA",
        side: "BUY",
        size: "1200"
      })
      .expect(200);

    assert.equal(insufficient.body.order.status, "REJECTED");
    assert.equal(insufficient.body.order.rejectionReason, "RISK_LIMIT");

    const tooLargeNotional = await request(app)
      .post("/markets/execute")
      .set(bearer())
      .set("x-payment", paymentHeader())
      .set("idempotency-key", `idem-${randomUUID()}`)
      .send({
        agentId,
        venueType: "SPOT",
        marketId: "KITE_bUSDT_BASE_SEPOLIA",
        side: "BUY",
        size: "1000",
        limitPrice: "100"
      })
      .expect(200);

    assert.equal(tooLargeNotional.body.order.status, "REJECTED");
    assert.equal(tooLargeNotional.body.order.rejectionReason, "RISK_LIMIT");
  });

  test("invalid payment header returns deterministic 402 challenge", async () => {
    const response = await request(app)
      .post("/markets/quote")
      .set(bearer())
      .set("x-payment", "not-valid")
      .send({
        agentId,
        venueType: "SPOT",
        marketId: "KITE_bUSDT_BASE_SEPOLIA",
        side: "BUY",
        size: "1"
      })
      .expect(402);

    assert.equal(response.body.code, "PAYMENT_REQUIRED");
    assert.equal(response.body.retryWithHeader, "X-PAYMENT");
    assert.equal(typeof response.body.payment.amount, "string");
  });

  test("unsupported market fails deterministically", async () => {
    const quote = await request(app)
      .post("/markets/quote")
      .set(bearer())
      .set("x-payment", paymentHeader())
      .send({
        agentId,
        venueType: "SPOT",
        marketId: "NOT_SUPPORTED",
        side: "BUY",
        size: "1"
      })
      .expect(400);

    assert.equal(quote.body.code, "UNSUPPORTED_MARKET");

    const execute = await request(app)
      .post("/markets/execute")
      .set(bearer())
      .set("x-payment", paymentHeader())
      .set("idempotency-key", `idem-${randomUUID()}`)
      .send({
        agentId,
        venueType: "SPOT",
        marketId: "NOT_SUPPORTED",
        side: "BUY",
        size: "1"
      })
      .expect(400);

    assert.equal(execute.body.code, "UNSUPPORTED_MARKET");
  });

  test("facilitator outage returns FACILITATOR_UNAVAILABLE with retryable detail", async () => {
    const response = await request(outageApp)
      .post("/markets/quote")
      .set(bearer())
      .set("x-payment", paymentHeader())
      .send({
        agentId,
        venueType: "SPOT",
        marketId: "KITE_bUSDT_BASE_SEPOLIA",
        side: "BUY",
        size: "1"
      })
      .expect(503);

    assert.equal(response.body.code, "FACILITATOR_UNAVAILABLE");
    assert.equal(response.body.details.retryable, true);
  });

  test("idempotency replay returns same response and payload mismatch returns 409", async () => {
    const idempotencyKey = `idem-${randomUUID()}`;
    const payload = {
      agentId,
      venueType: "SPOT",
      marketId: "KITE_bUSDT_BASE_SEPOLIA",
      side: "BUY",
      size: "1"
    };

    const first = await request(app)
      .post("/markets/execute")
      .set(bearer())
      .set("x-payment", paymentHeader())
      .set("idempotency-key", idempotencyKey)
      .send(payload)
      .expect(200);

    const replay = await request(app)
      .post("/markets/execute")
      .set(bearer())
      .set("x-payment", paymentHeader())
      .set("idempotency-key", idempotencyKey)
      .send(payload)
      .expect(200);

    assert.equal(replay.body.order.orderId, first.body.order.orderId);

    await request(app)
      .post("/markets/execute")
      .set(bearer())
      .set("x-payment", paymentHeader())
      .set("idempotency-key", idempotencyKey)
      .send({ ...payload, size: "2" })
      .expect(409);
  });

  test("orders and events enforce authorization boundaries", async () => {
    const execute = await request(app)
      .post("/markets/execute")
      .set(bearer())
      .set("x-payment", paymentHeader())
      .set("idempotency-key", `idem-${randomUUID()}`)
      .send({
        agentId,
        venueType: "SPOT",
        marketId: "KITE_bUSDT_BASE_SEPOLIA",
        side: "BUY",
        size: "1"
      })
      .expect(200);

    const otherToken = (
      await request(app)
        .post("/auth/siwe/verify")
        .send({
          message: "test-message",
          signature: "0xtest-signature",
          agentId: `agent-${randomUUID()}`,
          ownerAddress: "0x999"
        })
        .expect(200)
    ).body.token;

    await request(app)
      .get(`/orders/${execute.body.order.orderId}`)
      .set("authorization", `Bearer ${otherToken}`)
      .expect(403);

    await request(app)
      .get(`/events?agentId=${encodeURIComponent(agentId)}`)
      .set("authorization", `Bearer ${otherToken}`)
      .expect(403);
  });
}
