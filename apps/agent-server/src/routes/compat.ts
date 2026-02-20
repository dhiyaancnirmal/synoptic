import type { FastifyInstance } from "fastify";
import type { RuntimeStoreContract } from "../state/runtime-store.js";
import { Orchestrator } from "../runtime/orchestrator.js";
import { WsHub } from "../ws/hub.js";
import { verifyMessage } from "ethers";
import { RealTradingAdapter, verifyPassport } from "@synoptic/agent-core";
import type { AgentServerEnv } from "../env.js";
import { SessionAuth } from "../auth/session.js";

export async function registerCompatRoutes(
  app: FastifyInstance,
  store: RuntimeStoreContract,
  orchestrator: Orchestrator,
  wsHub: WsHub,
  env: AgentServerEnv,
  sessionAuth: SessionAuth
): Promise<void> {
  function getTradingAdapter() {
    if (!env.agentPrivateKey || !env.sepoliaRpcUrl || !env.uniswapApiKey) {
      return undefined;
    }
    return new RealTradingAdapter({
      privateKey: env.agentPrivateKey,
      sepoliaRpcUrl: env.sepoliaRpcUrl,
      uniswapApiKey: env.uniswapApiKey
    });
  }

  const dashboardHost = (() => {
    try {
      return new URL(env.dashboardUrl).host;
    } catch {
      return "localhost:3000";
    }
  })();

  app.get("/agents", async () => ({ agents: await store.compatAgents() }));

  app.get("/agents/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const agent = await store.compatAgent(id);
    if (!agent) {
      reply.status(404).send({
        code: "NOT_FOUND",
        message: "Agent not found",
        requestId: request.id
      });
      return;
    }
    return { agent };
  });

  app.post("/agents/:id/start", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const current = await store.getAgent(id);
    if (!current) {
      reply.status(404).send({
        code: "NOT_FOUND",
        message: "Agent not found",
        requestId: request.id
      });
      return;
    }
    if (current.status !== "idle" && current.status !== "paused" && current.status !== "running") {
      reply.status(409).send({
        code: "INVALID_TRANSITION",
        message: "Agent cannot transition to running",
        requestId: request.id
      });
      return;
    }

    const agent = await orchestrator.startAgent(id);
    if (!agent) {
      reply.status(404).send({
        code: "NOT_FOUND",
        message: "Agent not found",
        requestId: request.id
      });
      return;
    }
    wsHub.broadcast({ type: "agent.status", agentId: id, status: "running" });
    return { status: "running", agentId: id };
  });

  app.post("/agents/:id/stop", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const agent = await orchestrator.stopAgent(id);
    if (!agent) {
      reply.status(404).send({
        code: "NOT_FOUND",
        message: "Agent not found",
        requestId: request.id
      });
      return;
    }
    wsHub.broadcast({ type: "agent.status", agentId: id, status: "paused" });
    return { status: "paused", agentId: id };
  });

  app.post("/agents/:id/trigger", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const agent = await orchestrator.triggerAgent(id);
    if (!agent) {
      reply.status(404).send({
        code: "NOT_FOUND",
        message: "Agent not found",
        requestId: request.id
      });
      return;
    }
    const event = await store.addActivity(id, "agent.triggered", "kite-testnet", { source: "compat-api" });
    wsHub.broadcast({ type: "activity.new", event });
    return { triggered: true, agentId: id };
  });

  app.get("/events", async (request) => {
    const query = (request.query as { agentId?: string }) ?? {};
    return { events: await store.compatEvents(query.agentId ?? "") };
  });

  app.get("/orders/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const order = await store.compatOrder(id);
    if (!order) {
      reply.status(404).send({
        code: "NOT_FOUND",
        message: "Order not found",
        requestId: request.id
      });
      return;
    }
    return { order };
  });

  app.post("/markets/quote", async (request, reply) => {
    const tradingAdapter = getTradingAdapter();
    if (!tradingAdapter) {
      reply.status(503).send({
        code: "TRADING_NOT_CONFIGURED",
        message: "Set AGENT_PRIVATE_KEY, SEPOLIA_RPC_URL, and UNISWAP_API_KEY",
        requestId: request.id
      });
      return;
    }

    const body = (request.body as { agentId?: string; side?: "BUY" | "SELL"; size?: string; marketId?: string } | undefined) ?? {};
    const agentId = body.agentId;
    const size = body.size ?? "1";
    if (!agentId) {
      reply.status(400).send({ code: "INVALID_REQUEST", message: "agentId is required", requestId: request.id });
      return;
    }

    const agent = await store.getAgent(agentId);
    if (!agent) {
      reply.status(404).send({ code: "NOT_FOUND", message: "Agent not found", requestId: request.id });
      return;
    }

    const approval = await tradingAdapter.checkApproval({
      walletAddress: agent.eoaAddress,
      token: "0x0000000000000000000000000000000000000000",
      amount: size,
      chainId: 11155111
    });
    const quoteResult = await tradingAdapter.quote({
      tokenIn: "0x0000000000000000000000000000000000000000",
      tokenOut: "0x1111111111111111111111111111111111111111",
      amountIn: size,
      chainId: 11155111,
      swapper: agent.eoaAddress
    });

    return {
      approvalRequestId: approval.approvalRequestId ?? "",
      quoteId: String(quoteResult.quoteResponse.requestId ?? ""),
      amountOut: quoteResult.amountOut,
      quote: quoteResult.quoteResponse
    };
  });

  app.post("/markets/execute", async (request, reply) => {
    const tradingAdapter = getTradingAdapter();
    if (!tradingAdapter) {
      reply.status(503).send({
        code: "TRADING_NOT_CONFIGURED",
        message: "Set AGENT_PRIVATE_KEY, SEPOLIA_RPC_URL, and UNISWAP_API_KEY",
        requestId: request.id
      });
      return;
    }

    const body = (request.body as { agentId?: string; side?: "BUY" | "SELL"; size?: string; marketId?: string } | undefined) ?? {};
    const agentId = body.agentId;
    const size = body.size ?? "1";
    const marketId = body.marketId ?? "ETH-USDT";
    const side = body.side ?? "BUY";
    if (!agentId) {
      reply.status(400).send({ code: "INVALID_REQUEST", message: "agentId is required", requestId: request.id });
      return;
    }

    const agent = await store.getAgent(agentId);
    if (!agent) {
      reply.status(404).send({ code: "NOT_FOUND", message: "Agent not found", requestId: request.id });
      return;
    }

    const approval = await tradingAdapter.checkApproval({
      walletAddress: agent.eoaAddress,
      token: "0x0000000000000000000000000000000000000000",
      amount: size,
      chainId: 11155111
    });
    const quote = await tradingAdapter.quote({
      tokenIn: "0x0000000000000000000000000000000000000000",
      tokenOut: "0x1111111111111111111111111111111111111111",
      amountIn: size,
      chainId: 11155111,
      swapper: agent.eoaAddress
    });
    const swap = await tradingAdapter.executeSwap({ quoteResponse: quote.quoteResponse });
    const order = await store.createCompatOrder({ agentId, side, size, marketId });
    const event = await store.addActivity(agentId, "trade.executed", "sepolia", {
      orderId: order.orderId,
      approvalRequestId: approval.approvalRequestId ?? "",
      quoteRequestId: swap.quoteRequestId ?? String(quote.quoteResponse.requestId ?? ""),
      swapRequestId: swap.swapRequestId ?? "",
      txHash: swap.txHash
    });
    wsHub.broadcast({ type: "activity.new", event });

    return {
      order,
      approvalRequestId: approval.approvalRequestId ?? "",
      quoteRequestId: swap.quoteRequestId ?? String(quote.quoteResponse.requestId ?? ""),
      swapRequestId: swap.swapRequestId ?? "",
      txHash: swap.txHash,
      status: swap.status
    };
  });

  app.post("/auth/siwe/challenge", async (request, reply) => {
    const body = (request.body as { agentId?: string; ownerAddress?: string } | undefined) ?? {};
    const ownerAddress = body.ownerAddress?.trim();
    if (!ownerAddress || !/^0x[a-fA-F0-9]{40}$/.test(ownerAddress)) {
      reply.status(400).send({
        code: "INVALID_OWNER_ADDRESS",
        message: "Valid ownerAddress is required",
        requestId: request.id
      });
      return;
    }

    const existing = body.agentId ? await store.compatAgent(body.agentId) : undefined;
    const all = await store.compatAgents();
    const source = existing ?? all[0];
    const agentId = source?.agentId ?? body.agentId;
    if (!agentId) {
      reply.status(400).send({
        code: "NO_AGENT",
        message: "No agent available for challenge creation",
        requestId: request.id
      });
      return;
    }

    if (source?.ownerAddress && source.ownerAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
      reply.status(403).send({
        code: "OWNER_MISMATCH",
        message: "ownerAddress does not match agent owner",
        requestId: request.id
      });
      return;
    }

    const challenge = sessionAuth.createChallenge({
      domain: dashboardHost,
      uri: env.dashboardUrl,
      chainId: Number(process.env.KITE_CHAIN_ID ?? 2368),
      ownerAddress: ownerAddress.toLowerCase(),
      agentId,
      ttlMs: env.authChallengeTtlMs
    });

    return {
      challengeId: challenge.id,
      nonce: challenge.nonce,
      message: challenge.message,
      expiresAt: new Date(challenge.expiresAt).toISOString(),
      agentId,
      ownerAddress
    };
  });

  app.post("/auth/siwe/verify", async (request, reply) => {
    const body = (request.body as {
      agentId?: string;
      ownerAddress?: string;
      challengeId?: string;
      message?: string;
      signature?: string;
    } | undefined) ?? {};

    if (!body.challengeId || !body.signature || !body.message) {
      reply.status(400).send({
        code: "INVALID_REQUEST",
        message: "challengeId, message and signature are required",
        requestId: request.id
      });
      return;
    }

    const challenge = sessionAuth.consumeChallenge(body.challengeId);
    if (!challenge) {
      reply.status(401).send({
        code: "INVALID_CHALLENGE",
        message: "Challenge expired or unknown",
        requestId: request.id
      });
      return;
    }

    if (challenge.message !== body.message) {
      reply.status(401).send({
        code: "INVALID_CHALLENGE",
        message: "Challenge message mismatch",
        requestId: request.id
      });
      return;
    }

    const recovered = verifyMessage(body.message, body.signature).toLowerCase();
    if (recovered !== challenge.ownerAddress.toLowerCase()) {
      reply.status(401).send({
        code: "SIGNATURE_MISMATCH",
        message: "Signature does not match ownerAddress",
        requestId: request.id
      });
      return;
    }

    const passport = await verifyPassport(env.kiteRpcUrl);
    if (!passport.ok) {
      reply.status(502).send({
        code: "PASSPORT_UNAVAILABLE",
        message: passport.details ?? "Kite Passport verification failed",
        requestId: request.id
      });
      return;
    }

    return {
      token: sessionAuth.signSession({
        ownerAddress: challenge.ownerAddress,
        agentId: challenge.agentId,
        ttlSeconds: env.authSessionTtlSeconds
      })
    };
  });

}
