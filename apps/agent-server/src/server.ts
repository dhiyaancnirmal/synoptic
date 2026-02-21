import Fastify from "fastify";
import websocket from "@fastify/websocket";
import cors from "@fastify/cors";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { registerAgentRoutes } from "./routes/agents.js";
import { registerHoldingsRoutes } from "./routes/holdings.js";
import { registerTradeRoutes } from "./routes/trades.js";
import { registerPaymentRoutes } from "./routes/payments.js";
import { registerActivityRoutes } from "./routes/activity.js";
import { registerCompatRoutes } from "./routes/compat.js";
import { registerQuickNodeWebhookRoutes } from "./routes/quicknode.js";
import { registerTradeExecutionRoutes } from "./routes/trade-execution.js";
import { registerLiquidityRoutes } from "./routes/liquidity.js";
import { registerOracleRoutes } from "./oracle/server.js";
import { registerMarketplaceRoutes } from "./routes/marketplace.js";
import { DemoPaymentAdapter } from "./oracle/demo-facilitator.js";
import { RealFacilitatorPaymentAdapter } from "./oracle/facilitator.js";
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

function isLoopbackIp(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

function isLocalRequest(request: FastifyRequest): boolean {
  const origin = request.headers.origin;
  if (typeof origin === "string" && !isLocalDevOrigin(origin)) {
    return false;
  }
  return isLoopbackIp(request.ip);
}

function createStore(): { store: RuntimeStoreContract; usesDatabase: boolean } {
  if (!process.env.DATABASE_URL) {
    return { store: new RuntimeStore(), usesDatabase: false };
  }

  const db = createDbClient();
  const repos = createRepositories(db);
  return { store: new DbRuntimeStore(repos, db), usesDatabase: true };
}

export async function createServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  const env = loadEnv();
  const allowInsecureDevAuthBypass =
    env.allowInsecureDevAuthBypass && process.env.NODE_ENV !== "production";
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

  if (allowInsecureDevAuthBypass) {
    app.log.warn(
      "ALLOW_INSECURE_DEV_AUTH_BYPASS is enabled. Bearer auth is bypassed only for loopback local requests."
    );
  }

  const publicPaths = new Set([
    "/health",
    "/ws",
    "/auth/siwe/challenge",
    "/auth/siwe/verify",
    "/webhooks/quicknode/monad",
    "/oracle/price",
    "/trade/quote",
    "/trade/execute",
    "/trade/supported-chains",
    "/liquidity/quote",
    "/liquidity/create",
    "/liquidity/increase",
    "/liquidity/decrease",
    "/liquidity/collect",
    "/liquidity/history",
    "/api/liquidity/actions",
    "/marketplace/catalog"
  ]);
  app.addHook("onRequest", async (request, reply) => {
    if (request.method === "OPTIONS") return;
    const urlPath = request.url.split("?")[0] ?? request.url;
    if (publicPaths.has(urlPath)) return;
    if (urlPath.startsWith("/marketplace/")) return;
    if (allowInsecureDevAuthBypass && isLocalRequest(request)) return;

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
      facilitator: env.facilitatorMode,
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
    facilitatorMode: env.facilitatorMode,
    network: env.kiteNetwork,
    payToAddress: env.kiteServicePayTo,
    paymentAssetAddress: env.kiteTestUsdtAddress,
    paymentAssetDecimals: env.kitePaymentAssetDecimals,
    uniswapApiKey: env.uniswapApiKey,
    executionChainId: env.executionChainId,
    monadUsdcAddress: env.monadUsdcAddress
  });
  const marketplacePaymentAdapter =
    env.facilitatorMode === "demo"
      ? new DemoPaymentAdapter()
      : new RealFacilitatorPaymentAdapter({
          baseUrl: env.kiteFacilitatorUrl,
          network: env.kiteNetwork
        });
  await registerMarketplaceRoutes(app, {
    store,
    wsHub,
    paymentAdapter: marketplacePaymentAdapter,
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
    facilitatorUrl: env.kiteFacilitatorUrl,
    network: env.kiteNetwork,
    payToAddress: env.kiteServicePayTo,
    paymentAssetAddress: env.kiteTestUsdtAddress,
    paymentAssetDecimals: env.kitePaymentAssetDecimals,
    budgetResetTimeZone: env.budgetResetTimeZone
  });
  const liquidityPaymentAdapter =
    env.facilitatorMode === "demo"
      ? new DemoPaymentAdapter()
      : new RealFacilitatorPaymentAdapter({
          baseUrl: env.kiteFacilitatorUrl,
          network: env.kiteNetwork
        });
  await registerLiquidityRoutes(app, {
    store,
    wsHub,
    env,
    paymentAdapter: liquidityPaymentAdapter,
    network: env.kiteNetwork,
    payToAddress: env.kiteServicePayTo,
    paymentAssetAddress: env.kiteTestUsdtAddress,
    paymentAssetDecimals: env.kitePaymentAssetDecimals,
    budgetResetTimeZone: env.budgetResetTimeZone
  });

  return app;
}
