import { JsonRpcProvider, Wallet } from "ethers";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { UniswapClient, type PaymentAdapter, signAndBroadcastTransaction } from "@synoptic/agent-core";
import type { AgentServerEnv } from "../env.js";
import { requireX402Payment } from "../oracle/middleware.js";
import type { RuntimeStoreContract } from "../state/runtime-store.js";
import { WsHub } from "../ws/hub.js";

interface LiquidityRouteDeps {
  store: RuntimeStoreContract;
  wsHub: WsHub;
  env: AgentServerEnv;
  paymentAdapter: PaymentAdapter;
  network: string;
  payToAddress: string;
  paymentAssetAddress: string;
  paymentAssetDecimals: number;
  budgetResetTimeZone: string;
}

function createClient(env: AgentServerEnv): UniswapClient | undefined {
  if (!env.uniswapApiKey) return undefined;
  return new UniswapClient(env.uniswapApiKey);
}

function createSigner(env: AgentServerEnv): { wallet: Wallet; provider: JsonRpcProvider } | undefined {
  if (!env.agentPrivateKey || !env.executionRpcUrl) return undefined;
  const wallet = new Wallet(env.agentPrivateKey);
  const provider = new JsonRpcProvider(env.executionRpcUrl);
  return { wallet, provider };
}

function extractUnsignedTx(payload: Record<string, unknown>): {
  to: string;
  data: string;
  value?: string;
  chainId?: number;
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
} | null {
  const candidate = payload.tx ?? payload.swap;
  if (!candidate || typeof candidate !== "object") return null;
  const record = candidate as Record<string, unknown>;
  if (typeof record.to !== "string" || typeof record.data !== "string") return null;
  return {
    to: record.to,
    data: record.data,
    value: typeof record.value === "string" ? record.value : undefined,
    chainId: typeof record.chainId === "number" ? record.chainId : undefined,
    gasLimit: typeof record.gasLimit === "string" ? record.gasLimit : undefined,
    maxFeePerGas: typeof record.maxFeePerGas === "string" ? record.maxFeePerGas : undefined,
    maxPriorityFeePerGas:
      typeof record.maxPriorityFeePerGas === "string" ? record.maxPriorityFeePerGas : undefined
  };
}

export async function registerLiquidityRoutes(
  app: FastifyInstance,
  deps: LiquidityRouteDeps
): Promise<void> {
  app.get("/api/liquidity/actions", async (request) => {
    const limitRaw = Number((request.query as { limit?: string })?.limit ?? "200");
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, limitRaw)) : 200;
    const actions = await deps.store.listLiquidityActions(limit);
    return { actions };
  });

  app.get("/liquidity/history", async (request, reply) => {
    const client = createClient(deps.env);
    if (!client) {
      return reply.status(503).send({
        code: "TRADING_NOT_CONFIGURED",
        message: "Set UNISWAP_API_KEY"
      });
    }
    const query = (request.query as { walletAddress?: string; chainId?: string }) ?? {};
    const chainId = Number(query.chainId ?? deps.env.executionChainId);
    const agents = await deps.store.listAgents();
    const walletAddress = query.walletAddress ?? agents[0]?.eoaAddress;
    if (!walletAddress) {
      return reply.status(400).send({ code: "MISSING_WALLET", message: "walletAddress is required" });
    }
    const history = await client.lpHistory(walletAddress, chainId);
    return { chainId, walletAddress, history };
  });

  app.post("/liquidity/quote", async (request, reply) => {
    const client = createClient(deps.env);
    if (!client) {
      return reply.status(503).send({
        code: "TRADING_NOT_CONFIGURED",
        message: "Set UNISWAP_API_KEY"
      });
    }
    const body = (request.body as Record<string, unknown> | undefined) ?? {};
    const quote = await client.lpQuote(body);
    return { quote };
  });

  async function handleMutatingLiquidityAction(
    actionType: "create" | "increase" | "decrease" | "collect",
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const allowed = await requireX402Payment(request, reply, {
      store: deps.store,
      paymentAdapter: deps.paymentAdapter,
      network: deps.network,
      payToAddress: deps.payToAddress,
      paymentAssetAddress: deps.paymentAssetAddress,
      paymentAssetDecimals: deps.paymentAssetDecimals,
      budgetResetTimeZone: deps.budgetResetTimeZone,
      enforceLocalBudget: false,
      onPayment(payment) {
        deps.wsHub.broadcast({ type: "payment.update", payment });
      },
      onActivity(event) {
        deps.wsHub.broadcast({ type: "activity.new", event });
      }
    });
    if (!allowed) return;

    const client = createClient(deps.env);
    const signer = createSigner(deps.env);
    if (!client || !signer) {
      return reply.status(503).send({
        code: "TRADING_NOT_CONFIGURED",
        message: "Set AGENT_PRIVATE_KEY, EXECUTION_RPC_URL, and UNISWAP_API_KEY"
      });
    }

    const body = (request.body as Record<string, unknown> | undefined) ?? {};
    const chainId = Number(body.chainId ?? deps.env.executionChainId);
    const token0 = String(body.token0 ?? "");
    const token1 = String(body.token1 ?? "");
    const amount0 = String(body.amount0 ?? "0");
    const amount1 = String(body.amount1 ?? "0");
    const feeTier = Number(body.feeTier ?? 3000);
    const preset = String(body.preset ?? "uniform") as "uniform" | "bell" | "bid_ask_inverse";
    const lowerBoundPct = Number(body.lowerBoundPct ?? -0.2);
    const upperBoundPct = Number(body.upperBoundPct ?? 0.2);
    const agent = (await deps.store.listAgents())[0];
    const agentId = String(body.agentId ?? agent?.id ?? "");
    if (!agentId) {
      return reply.status(400).send({ code: "NO_AGENT", message: "No agent available" });
    }

    const action = await deps.store.createLiquidityAction({
      agentId,
      actionType,
      chainId,
      token0,
      token1,
      feeTier,
      preset,
      lowerBoundPct,
      upperBoundPct,
      amount0,
      amount1,
      status: "submitted"
    });

    try {
      const payload =
        actionType === "create"
          ? await client.lpCreate(body)
          : actionType === "increase"
            ? await client.lpIncrease(body)
            : actionType === "decrease"
              ? await client.lpDecrease(body)
              : await client.lpCollect(body);
      const unsignedTx = extractUnsignedTx(payload as Record<string, unknown>);
      if (!unsignedTx) {
        const failed = await deps.store.updateLiquidityAction(action.id, {
          status: "failed",
          errorMessage: "Missing transaction payload in Uniswap LP response"
        });
        return reply.status(502).send({
          code: "LP_TX_MISSING",
          message: "Uniswap LP response did not include a transaction payload",
          action: failed ?? action,
          payload
        });
      }

      const broadcasted = await signAndBroadcastTransaction({
        wallet: signer.wallet,
        provider: signer.provider,
        unsignedTx
      });
      const positionId =
        typeof (payload as Record<string, unknown>).positionId === "string"
          ? ((payload as Record<string, unknown>).positionId as string)
          : undefined;
      const updated = await deps.store.updateLiquidityAction(action.id, {
        status: "confirmed",
        txHash: broadcasted.txHash,
        positionId
      });

      const event = await deps.store.addActivity(agentId, `liquidity.${actionType}`, "monad-testnet", {
        liquidityActionId: action.id,
        chainId,
        token0,
        token1,
        feeTier,
        txHash: broadcasted.txHash
      });
      deps.wsHub.broadcast({ type: "activity.new", event });

      return {
        actionId: action.id,
        txHash: broadcasted.txHash,
        positionId,
        status: updated?.status ?? "confirmed",
        action: updated ?? action,
        payload
      };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Liquidity action failed";
      const failed = await deps.store.updateLiquidityAction(action.id, {
        status: "failed",
        errorMessage: message
      });
      return reply.status(500).send({
        code: "LP_ACTION_FAILED",
        message,
        action: failed ?? action
      });
    }
  }

  app.post("/liquidity/create", async (request, reply) =>
    handleMutatingLiquidityAction("create", request, reply)
  );
  app.post("/liquidity/increase", async (request, reply) =>
    handleMutatingLiquidityAction("increase", request, reply)
  );
  app.post("/liquidity/decrease", async (request, reply) =>
    handleMutatingLiquidityAction("decrease", request, reply)
  );
  app.post("/liquidity/collect", async (request, reply) =>
    handleMutatingLiquidityAction("collect", request, reply)
  );
}
