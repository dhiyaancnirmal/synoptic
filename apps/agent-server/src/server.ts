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
import { registerOracleRoutes } from "./oracle/server.js";
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
  return { store: new DbRuntimeStore(repos), usesDatabase: true };
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

  const publicPaths = new Set([
    "/health",
    "/ws",
    "/auth/siwe/challenge",
    "/auth/siwe/verify",
    "/webhooks/quicknode/monad",
    "/oracle/price",
    "/trade/quote",
    "/trade/execute"
  ]);
  app.addHook("onRequest", async (request, reply) => {
    if (request.method === "OPTIONS") return;
    if (publicPaths.has(request.url.split("?")[0] ?? request.url)) return;

    const header = request.headers.authorization;
    const token =
      typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token || !sessionAuth.verifySession(token)) {
      reply.status(401).send({
        code: "UNAUTHORIZED",
        message: "Valid bearer token required",
        requestId: request.id
      });
    }
  });

  const tradingConfigured =
    Boolean(env.agentPrivateKey) && Boolean(env.executionRpcUrl) && Boolean(env.uniswapApiKey);
  const attestationConfigured =
    Boolean(env.agentPrivateKey) && Boolean(env.kiteRpcUrl) && Boolean(env.registryAddress);

  app.get("/health", async () => ({
    status: "ok",
    service: "agent-server",
    timestamp: new Date().toISOString(),
    dependencies: {
      database: usesDatabase ? "up" : "down",
      facilitator: "real",
      auth: "passport"
    },
    capabilities: {
      trading: tradingConfigured ? "configured" : "not_configured",
      attestation: attestationConfigured ? "configured" : "not_configured"
    }
  }));

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
  await registerCompatRoutes(app, store, orchestrator, wsHub, env, sessionAuth);
  await registerOracleRoutes(app, {
    store,
    wsHub,
    budgetResetTimeZone: env.budgetResetTimeZone,
    facilitatorUrl: env.kiteFacilitatorUrl,
    network: env.kiteNetwork,
    payToAddress: env.kiteServicePayTo,
    paymentAssetAddress: env.kiteTestUsdtAddress
  });
  await registerTradeExecutionRoutes(app, {
    store,
    wsHub,
    env,
    facilitatorUrl: env.kiteFacilitatorUrl,
    network: env.kiteNetwork,
    payToAddress: env.kiteServicePayTo,
    paymentAssetAddress: env.kiteTestUsdtAddress,
    budgetResetTimeZone: env.budgetResetTimeZone
  });

  return app;
}
