import { createHash } from "node:crypto";
import { JsonRpcProvider, Wallet } from "ethers";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  UniswapClient,
  RealAttestationAdapter,
  getExecutionChainProfile,
  type AttestationAdapter,
  type PaymentAdapter,
  signAndBroadcastTransaction
} from "@synoptic/agent-core";
import type { AgentServerEnv } from "../env.js";
import { requireX402Payment } from "../oracle/middleware.js";
import type { RuntimeStoreContract } from "../state/runtime-store.js";
import { resolveSwapModeForChain, type SwapModeResolution } from "../trading/execution-mode.js";
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
  liquidityActionCostUsd: number;
}

interface SimulationMetadata {
  enabled: true;
  reason: string;
  chainId: number;
  chainName: string;
}

function createClient(env: AgentServerEnv): UniswapClient | undefined {
  if (!env.uniswapApiKey) return undefined;
  return new UniswapClient(env.uniswapApiKey, env.uniswapApiUrl || undefined);
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

function buildSimulationMetadata(resolution: SwapModeResolution): SimulationMetadata | undefined {
  if (resolution.effectiveMode !== "simulated") return undefined;
  return {
    enabled: true,
    reason: resolution.reason,
    chainId: resolution.profile.chainId,
    chainName: resolution.profile.name
  };
}

function unsupportedLiveModePayload(resolution: SwapModeResolution, chainId: number) {
  return {
    code: "UNSUPPORTED_CHAIN",
    message: `SWAP_EXECUTION_MODE=live is not supported for chainId ${chainId}.`,
    details: {
      chainId,
      resolutionReason: resolution.reason
    }
  };
}

function deterministicSimulatedTxHash(actionId: string, chainId: number, actionType: string): string {
  const digest = createHash("sha256")
    .update(`synoptic:simulated:liquidity:${chainId}:${actionType}:${actionId}`)
    .digest("hex");
  return `0x${digest.slice(0, 64)}`;
}

function deterministicSimulatedPositionId(actionId: string): string {
  return createHash("sha256").update(`synoptic:simulated:position:${actionId}`).digest("hex").slice(0, 16);
}

function randomHex(bytes = 32): string {
  return `0x${createHash("sha256").update(String(Date.now()) + String(Math.random())).digest("hex").slice(0, bytes * 2)}`;
}

function createSimulatedAttestationAdapter(): AttestationAdapter {
  return {
    async recordService() {
      return { attestationTxHash: randomHex(32) };
    },
    async recordTrade() {
      return { attestationTxHash: randomHex(32) };
    }
  };
}

function createAttestationAdapterForResolution(
  env: AgentServerEnv,
  resolution: SwapModeResolution
): AttestationAdapter | undefined {
  if (resolution.effectiveMode === "simulated") {
    return createSimulatedAttestationAdapter();
  }
  if (!env.agentPrivateKey || !env.kiteRpcUrl || !env.registryAddress) {
    return undefined;
  }
  return new RealAttestationAdapter({
    privateKey: env.agentPrivateKey,
    kiteRpcUrl: env.kiteRpcUrl,
    serviceRegistryAddress: env.registryAddress
  });
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
    const query = (request.query as { walletAddress?: string; chainId?: string }) ?? {};
    const chainId = Number(query.chainId ?? deps.env.executionChainId);
    const resolution = resolveSwapModeForChain(deps.env, chainId);
    if (resolution.requestedMode === "live" && resolution.effectiveMode === "simulated") {
      return reply.status(400).send(unsupportedLiveModePayload(resolution, chainId));
    }

    const agents = await deps.store.listAgents();
    const walletAddress = query.walletAddress ?? agents[0]?.eoaAddress;
    if (!walletAddress) {
      return reply.status(400).send({ code: "MISSING_WALLET", message: "walletAddress is required" });
    }

    const simulation = buildSimulationMetadata(resolution);
    if (simulation) {
      const actions = (await deps.store.listLiquidityActions(200)).filter((action) => action.chainId === chainId);
      return {
        chainId,
        walletAddress,
        history: {
          actions
        },
        simulation
      };
    }

    const client = createClient(deps.env);
    if (!client) {
      return reply.status(503).send({
        code: "TRADING_NOT_CONFIGURED",
        message: "Set UNISWAP_API_KEY"
      });
    }

    const history = await client.lpHistory(walletAddress, chainId);
    return { chainId, walletAddress, history };
  });

  app.post("/liquidity/quote", async (request, reply) => {
    const body = (request.body as Record<string, unknown> | undefined) ?? {};
    const chainId = Number(body.chainId ?? deps.env.executionChainId);
    const resolution = resolveSwapModeForChain(deps.env, chainId);
    if (resolution.requestedMode === "live" && resolution.effectiveMode === "simulated") {
      return reply.status(400).send(unsupportedLiveModePayload(resolution, chainId));
    }

    const simulation = buildSimulationMetadata(resolution);
    if (simulation) {
      const profile = getExecutionChainProfile(chainId);
      return {
        quote: {
          requestId: `sim-lp-quote-${Date.now()}`,
          chainId,
          token0: String(body.token0 ?? profile.wrappedNativeToken),
          token1: String(body.token1 ?? profile.stableToken),
          feeTier: Number(body.feeTier ?? 3000),
          status: "quoted",
          simulation
        },
        simulation
      };
    }

    const client = createClient(deps.env);
    if (!client) {
      return reply.status(503).send({
        code: "TRADING_NOT_CONFIGURED",
        message: "Set UNISWAP_API_KEY"
      });
    }

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
      fixedCostUsd: deps.liquidityActionCostUsd,
      onPayment(payment) {
        deps.wsHub.broadcast({ type: "payment.update", payment });
      },
      onActivity(event) {
        deps.wsHub.broadcast({ type: "activity.new", event });
      }
    });
    if (!allowed) return;

    const body = (request.body as Record<string, unknown> | undefined) ?? {};
    const chainId = Number(body.chainId ?? deps.env.executionChainId);
    const resolution = resolveSwapModeForChain(deps.env, chainId);
    if (resolution.requestedMode === "live" && resolution.effectiveMode === "simulated") {
      return reply.status(400).send(unsupportedLiveModePayload(resolution, chainId));
    }
    const simulation = buildSimulationMetadata(resolution);
    const attestationAdapter = createAttestationAdapterForResolution(deps.env, resolution);
    if (!attestationAdapter) {
      return reply.status(503).send({
        code: "ATTESTATION_NOT_CONFIGURED",
        message: "Set AGENT_PRIVATE_KEY, KITE_RPC_URL, and SERVICE_REGISTRY_ADDRESS"
      });
    }

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
      if (simulation) {
        const txHash = deterministicSimulatedTxHash(action.id, chainId, actionType);
        const positionId =
          actionType === "create"
            ? deterministicSimulatedPositionId(action.id)
            : typeof body.positionId === "string" && body.positionId.length > 0
              ? body.positionId
              : undefined;
        const updated = await deps.store.updateLiquidityAction(action.id, {
          status: "confirmed",
          txHash,
          positionId
        });
        const event = await deps.store.addActivity(agentId, `liquidity.${actionType}`, resolution.profile.name, {
          liquidityActionId: action.id,
          chainId,
          token0,
          token1,
          feeTier,
          txHash,
          simulated: true
        });
        deps.wsHub.broadcast({ type: "activity.new", event });

        let attestationTxHash: string;
        try {
          if (attestationAdapter.recordService) {
            const attested = await attestationAdapter.recordService({
              serviceType: `liquidity_${actionType}`,
              sourceChainId: chainId,
              sourceTxHashOrRef: txHash,
              tokenIn: token0,
              tokenOut: token1,
              amountIn: amount0,
              amountOut: amount1,
              metadata: "x402-gated liquidity action"
            });
            attestationTxHash = attested.attestationTxHash;
          } else {
            const attested = await attestationAdapter.recordTrade({
              sourceChainId: chainId,
              sourceTxHash: txHash,
              tokenIn: token0,
              tokenOut: token1,
              amountIn: amount0,
              amountOut: amount1,
              strategyReason: "x402-gated liquidity action"
            });
            attestationTxHash = attested.attestationTxHash;
          }
        } catch (cause) {
          await deps.store.updateLiquidityAction(action.id, {
            status: "failed",
            txHash,
            positionId,
            errorMessage: cause instanceof Error ? cause.message : "Attestation failed"
          });
          return reply.status(502).send({
            code: "ATTESTATION_FAILED",
            message: cause instanceof Error ? cause.message : "Attestation failed",
            actionId: action.id,
            txHash
          });
        }
        const attestEvent = await deps.store.addActivity(agentId, "liquidity.attested", "kite-testnet", {
          liquidityActionId: action.id,
          sourceTxHash: txHash,
          attestationTxHash
        });
        deps.wsHub.broadcast({ type: "activity.new", event: attestEvent });

        return {
          actionId: action.id,
          txHash,
          attestationTxHash,
          positionId,
          status: updated?.status ?? "confirmed",
          action: updated ?? action,
          payload: { requestId: `sim-lp-${actionType}-${action.id}`, simulation },
          simulation
        };
      }

      const client = createClient(deps.env);
      const signer = createSigner(deps.env);
      if (!client || !signer) {
        return reply.status(503).send({
          code: "TRADING_NOT_CONFIGURED",
          message: "Set AGENT_PRIVATE_KEY, EXECUTION_RPC_URL, and UNISWAP_API_KEY"
        });
      }

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

      const event = await deps.store.addActivity(agentId, `liquidity.${actionType}`, resolution.profile.name, {
        liquidityActionId: action.id,
        chainId,
        token0,
        token1,
        feeTier,
        txHash: broadcasted.txHash
      });
      deps.wsHub.broadcast({ type: "activity.new", event });

      let attestationTxHash: string;
      try {
        if (attestationAdapter.recordService) {
          const attested = await attestationAdapter.recordService({
            serviceType: `liquidity_${actionType}`,
            sourceChainId: chainId,
            sourceTxHashOrRef: broadcasted.txHash,
            tokenIn: token0,
            tokenOut: token1,
            amountIn: amount0,
            amountOut: amount1,
            metadata: "x402-gated liquidity action"
          });
          attestationTxHash = attested.attestationTxHash;
        } else {
          const attested = await attestationAdapter.recordTrade({
            sourceChainId: chainId,
            sourceTxHash: broadcasted.txHash,
            tokenIn: token0,
            tokenOut: token1,
            amountIn: amount0,
            amountOut: amount1,
            strategyReason: "x402-gated liquidity action"
          });
          attestationTxHash = attested.attestationTxHash;
        }
      } catch (cause) {
        await deps.store.updateLiquidityAction(action.id, {
          status: "failed",
          txHash: broadcasted.txHash,
          positionId,
          errorMessage: cause instanceof Error ? cause.message : "Attestation failed"
        });
        return reply.status(502).send({
          code: "ATTESTATION_FAILED",
          message: cause instanceof Error ? cause.message : "Attestation failed",
          actionId: action.id,
          txHash: broadcasted.txHash
        });
      }
      const attestEvent = await deps.store.addActivity(agentId, "liquidity.attested", "kite-testnet", {
        liquidityActionId: action.id,
        sourceTxHash: broadcasted.txHash,
        attestationTxHash
      });
      deps.wsHub.broadcast({ type: "activity.new", event: attestEvent });

      return {
        actionId: action.id,
        txHash: broadcasted.txHash,
        attestationTxHash,
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
