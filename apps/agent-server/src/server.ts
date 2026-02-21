import Fastify from "fastify";
import websocket from "@fastify/websocket";
import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";
import { registerAgentRoutes } from "./routes/agents.js";
import { registerHoldingsRoutes } from "./routes/holdings.js";
import { registerTradeRoutes } from "./routes/trades.js";
import { registerPaymentRoutes } from "./routes/payments.js";
import { registerActivityRoutes } from "./routes/activity.js";
import { registerCompatRoutes } from "./routes/compat.js";
import { registerQuickNodeWebhookRoutes } from "./routes/quicknode.js";
import { registerTradeExecutionRoutes } from "./routes/trade-execution.js";
import { registerAuthWalletRoutes } from "./routes/auth-wallet.js";
import { registerIdentityRoutes, readIdentityState } from "./routes/identity.js";
import { registerOracleRoutes } from "./oracle/server.js";
import { registerMarketplaceRoutes } from "./routes/marketplace.js";
import { createPaymentAdapter, PaymentCapabilityProbe } from "./oracle/payment-capabilities.js";
import { sendEvent } from "./ws/handler.js";
import { WsHub } from "./ws/hub.js";
import { createDbClient, createRepositories } from "@synoptic/db";
import { DbRuntimeStore } from "./state/db-runtime-store.js";
import { RuntimeStore, type RuntimeStoreContract } from "./state/runtime-store.js";
import { loadEnv } from "./env.js";
import { Orchestrator } from "./runtime/orchestrator.js";
import type { AgentTickRunner } from "./runtime/agent-loop.js";
import { SessionAuth } from "./auth/session.js";
import { createDefaultTickRunner } from "./runtime/default-tick-runner.js";

export interface ServerOptions {
  tickRunner?: AgentTickRunner;
  random?: () => number;
}

declare module "fastify" {
  interface FastifyRequest {
    authClaims?: {
      agentId: string;
      ownerAddress: string;
      tokenType: "access" | "refresh";
    };
  }
}

const PLACEHOLDER_OWNER = "0x0000000000000000000000000000000000000001";
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function isLocalDevOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function createStore(): { store: RuntimeStoreContract; usesDatabase: boolean } {
  if (!process.env.DATABASE_URL) {
    return { store: new RuntimeStore(), usesDatabase: false };
  }

  const db = createDbClient();
  const repos = createRepositories(db);
  return { store: new DbRuntimeStore(repos, db), usesDatabase: true };
}

function normalizeAddress(value: string): string {
  return value.toLowerCase();
}

function isPlaceholderOwner(value: string | undefined): boolean {
  if (!value) return false;
  return normalizeAddress(value) === PLACEHOLDER_OWNER;
}

function maybeJson(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function decodeBase64(value: string): string | undefined {
  try {
    return Buffer.from(value, "base64").toString("utf-8");
  } catch {
    return undefined;
  }
}

function decodeBase64Url(value: string): string | undefined {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    return Buffer.from(padded, "base64").toString("utf-8");
  } catch {
    return undefined;
  }
}

function parseXPaymentHeader(value: string): Record<string, unknown> | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const direct = maybeJson(trimmed);
  if (direct) return direct;

  const decoded = decodeBase64(trimmed);
  if (decoded) {
    const parsed = maybeJson(decoded);
    if (parsed) return parsed;
  }

  const decodedUrl = decodeBase64Url(trimmed);
  if (decodedUrl) {
    const parsed = maybeJson(decodedUrl);
    if (parsed) return parsed;
  }

  return undefined;
}

function extractPayerFromXPayment(value: string): string | undefined {
  const parsed = parseXPaymentHeader(value);
  if (!parsed) return undefined;

  const payload =
    parsed.paymentPayload && typeof parsed.paymentPayload === "object"
      ? (parsed.paymentPayload as Record<string, unknown>)
      : parsed;
  const nestedPayload =
    payload.payload && typeof payload.payload === "object"
      ? (payload.payload as Record<string, unknown>)
      : undefined;
  const authorization =
    (payload.authorization && typeof payload.authorization === "object"
      ? (payload.authorization as Record<string, unknown>)
      : nestedPayload?.authorization && typeof nestedPayload.authorization === "object"
        ? (nestedPayload.authorization as Record<string, unknown>)
        : undefined) ?? {};

  const from =
    (typeof authorization.from === "string" ? authorization.from : undefined) ??
    (typeof authorization.payer === "string" ? authorization.payer : undefined);
  if (!from || !EVM_ADDRESS_RE.test(from)) return undefined;
  return normalizeAddress(from);
}

export async function createServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  const env = loadEnv();
  const sessionAuth = new SessionAuth(env.authTokenSecret);
  const { store, usesDatabase } = createStore();
  const wsHub = new WsHub();
  const canRunRealTick =
    Boolean(env.agentPrivateKey) &&
    Boolean(env.executionRpcUrl) &&
    Boolean(env.kiteRpcUrl) &&
    Boolean(env.uniswapApiKey) &&
    Boolean(env.registryAddress);
  const tickRunner =
    options.tickRunner ??
    (canRunRealTick
      ? createDefaultTickRunner({
          store,
          executionRpcUrl: env.executionRpcUrl,
          kiteRpcUrl: env.kiteRpcUrl,
          privateKey: env.agentPrivateKey,
          uniswapApiKey: env.uniswapApiKey,
          registryAddress: env.registryAddress,
          onTrade: (trade) => wsHub.broadcast({ type: "trade.update", trade }),
          onActivity: (event) => wsHub.broadcast({ type: "activity.new", event })
        })
      : undefined);
  const orchestrator = new Orchestrator({
    store,
    tickIntervalMs: env.agentTickIntervalMs,
    maxConsecutiveErrors: env.agentMaxConsecutiveErrors,
    tickRunner,
    random: options.random,
    onAgentStatus: (agentId, status) => {
      wsHub.broadcast({ type: "agent.status", agentId, status });
    },
    onActivity: (event) => {
      wsHub.broadcast({ type: "activity.new", event });
    }
  });
  const existingAgents = await store.listAgents();
  const bootstrap =
    existingAgents[0] ?? (await store.createAgent({ name: "Bootstrap Agent", status: "idle" }));

  await app.register(cors, {
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    strictPreflight: false,
    allowedHeaders: [
      "content-type",
      "authorization",
      "idempotency-key",
      "x-payment",
      "x-payment-request-id",
      "x-request-id"
    ],
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      const normalized = origin.replace(/\/$/, "");
      const allowed = new Set([env.dashboardUrl.replace(/\/$/, "")]);
      cb(null, allowed.has(normalized) || isLocalDevOrigin(normalized));
    }
  });

  await app.register(websocket);

  const paymentProbe = new PaymentCapabilityProbe(env);
  const paymentAdapter = createPaymentAdapter(env);

  const publicPaths = new Set([
    "/health",
    "/ws",
    "/api/auth/wallet/challenge",
    "/api/auth/wallet/verify",
    "/auth/siwe/challenge",
    "/auth/siwe/verify",
    "/webhooks/quicknode/monad",
    "/oracle/price",
    "/trade/quote",
    "/trade/execute",
    "/marketplace/catalog"
  ]);
  app.addHook("onRequest", async (request, reply) => {
    if (request.method === "OPTIONS") return;
    const urlPath = request.url.split("?")[0] ?? request.url;
    if (request.method === "POST" && urlPath === "/api/auth/session") return;

    const isPublic = publicPaths.has(urlPath) || urlPath.startsWith("/marketplace/catalog");

    const header = request.headers.authorization;
    const token =
      typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const xPaymentHeader = request.headers["x-payment"];
    const hasXPayment = typeof xPaymentHeader === "string" && xPaymentHeader.length > 0;

    if (!token) {
      if (hasXPayment) {
        reply.status(401).send({
          code: "UNAUTHORIZED",
          message: "Bearer token is required with x-payment",
          requestId: request.id
        });
        return;
      }
      if (isPublic) return;
      reply.status(401).send({
        code: "UNAUTHORIZED",
        message: "Valid bearer token required",
        requestId: request.id
      });
      return;
    }

    const claims = sessionAuth.verifySession(token);
    if (!claims) {
      reply.status(401).send({
        code: "UNAUTHORIZED",
        message: "Valid bearer token required",
        requestId: request.id
      });
      return;
    }

    request.authClaims = {
      agentId: claims.agentId,
      ownerAddress: claims.ownerAddress,
      tokenType: claims.tokenType
    };

    const agent = await store.getAgent(claims.agentId);
    if (!agent) {
      if (hasXPayment || urlPath.startsWith("/api/identity")) {
        reply.status(401).send({
          code: "AGENT_NOT_FOUND",
          message: "Session agent not found",
          requestId: request.id
        });
      }
      return;
    }

    const normalizedOwner = normalizeAddress(claims.ownerAddress);
    if (
      agent.eoaAddress &&
      !isPlaceholderOwner(agent.eoaAddress) &&
      normalizeAddress(agent.eoaAddress) !== normalizedOwner
    ) {
      reply.status(403).send({
        code: "OWNER_MISMATCH",
        message: "Session owner does not match agent owner",
        requestId: request.id
      });
      return;
    }

    if (hasXPayment) {
      const payerFromPayment = extractPayerFromXPayment(xPaymentHeader);
      if (!payerFromPayment) {
        reply.status(400).send({
          code: "INVALID_X_PAYMENT",
          message: "x-payment must include authorization.from (or payer)",
          requestId: request.id
        });
        return;
      }

      const identity = readIdentityState(agent.strategyConfig);
      if (!identity.payerAddress) {
        reply.status(403).send({
          code: "PAYER_NOT_LINKED",
          message: "No linked payer address for session identity",
          requestId: request.id
        });
        return;
      }

      if (normalizeAddress(identity.payerAddress) !== payerFromPayment) {
        reply.status(403).send({
          code: "PAYER_MISMATCH",
          message: "x-payment payer does not match linked identity payer",
          requestId: request.id
        });
        return;
      }
    }
  });

  const tradingConfigured =
    Boolean(env.agentPrivateKey) && Boolean(env.executionRpcUrl) && Boolean(env.uniswapApiKey);
  const attestationConfigured =
    Boolean(env.agentPrivateKey) && Boolean(env.kiteRpcUrl) && Boolean(env.registryAddress);

  app.get("/health", async () => {
    const payment = await paymentProbe.getStatus();
    return {
      status: "ok",
      service: "agent-server",
      timestamp: new Date().toISOString(),
      dependencies: {
        database: usesDatabase ? "up" : "down",
        facilitator: env.kitePaymentMode,
        auth: "passport"
      },
      capabilities: {
        trading: tradingConfigured ? "configured" : "not_configured",
        attestation: attestationConfigured ? "configured" : "not_configured",
        serverSigning: env.allowServerSigning ? "enabled" : "disabled"
      },
      payment
    };
  });

  app.get("/ws", { websocket: true }, (socket) => {
    wsHub.subscribe(socket);
    sendEvent(socket, {
      type: "activity.new",
      event: {
        id: "bootstrap",
        agentId: bootstrap.id,
        eventType: "agent.started",
        chain: "kite-testnet",
        createdAt: new Date().toISOString(),
        data: { message: "ws connected" }
      }
    });
  });

  app.addHook("onReady", async () => {
    await paymentProbe.refresh().catch((error) => {
      app.log.warn(
        {
          error: error instanceof Error ? error.message : String(error)
        },
        "payment capability probe failed during startup"
      );
    });
    await orchestrator.boot();
  });
  app.addHook("onClose", async () => {
    await orchestrator.stopAll();
  });

  await registerAgentRoutes(app, store, orchestrator, wsHub);
  await registerHoldingsRoutes(app, store);
  await registerTradeRoutes(app, store);
  await registerPaymentRoutes(app, store);
  await registerActivityRoutes(app, store);
  await registerQuickNodeWebhookRoutes(app, {
    store,
    wsHub,
    securityToken: env.quicknodeSecurityToken
  });
  await registerAuthWalletRoutes(app, {
    store,
    env,
    sessionAuth
  });
  await registerIdentityRoutes(app, {
    store,
    sessionAuth
  });
  await registerCompatRoutes(app, store, orchestrator, wsHub, env, sessionAuth);
  await registerOracleRoutes(app, {
    store,
    wsHub,
    budgetResetTimeZone: env.budgetResetTimeZone,
    paymentAdapter,
    network: env.kiteNetwork,
    payToAddress: env.kiteServicePayTo,
    paymentAssetAddress: env.kiteTestUsdtAddress,
    paymentAssetDecimals: env.kitePaymentAssetDecimals
  });
  await registerMarketplaceRoutes(app, {
    store,
    wsHub,
    paymentAdapter,
    network: env.kiteNetwork,
    payToAddress: env.kiteServicePayTo,
    paymentAssetAddress: env.kiteTestUsdtAddress,
    paymentAssetDecimals: env.kitePaymentAssetDecimals,
    budgetResetTimeZone: env.budgetResetTimeZone
  });
  await registerTradeExecutionRoutes(app, {
    store,
    wsHub,
    env,
    paymentAdapter,
    network: env.kiteNetwork,
    payToAddress: env.kiteServicePayTo,
    paymentAssetAddress: env.kiteTestUsdtAddress,
    paymentAssetDecimals: env.kitePaymentAssetDecimals,
    budgetResetTimeZone: env.budgetResetTimeZone
  });

  return app;
}
