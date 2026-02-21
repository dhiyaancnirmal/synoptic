import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { RuntimeStoreContract } from "../state/runtime-store.js";
import { WsHub } from "../ws/hub.js";
import {
  RealTradingAdapter,
  RealAttestationAdapter,
  MONAD_CHAIN_ID,
  MONAD_TESTNET_CHAIN_ID,
  getExecutionChainProfile,
  type TradingAdapter,
  type AttestationAdapter
} from "@synoptic/agent-core";
import { createPaymentAdapter } from "../oracle/payment-adapter.js";
import { requireX402Payment } from "../oracle/middleware.js";
import type { AgentServerEnv } from "../env.js";
import {
  isLiveExecutionConfigured,
  resolveSwapModeForChain,
  type SwapModeResolution
} from "../trading/execution-mode.js";

interface TradeExecutionDeps {
  store: RuntimeStoreContract;
  wsHub: WsHub;
  env: AgentServerEnv;
  facilitatorUrl: string;
  network: string;
  payToAddress: string;
  paymentAssetAddress: string;
  paymentAssetDecimals: number;
  budgetResetTimeZone: string;
  quoteCostUsd: number;
  executeCostUsd: number;
}

type TradeIntent = "swap" | "order";
type TradeRoutingType =
  | "CLASSIC"
  | "DUTCH_LIMIT"
  | "DUTCH_V2"
  | "LIMIT_ORDER"
  | "WRAP"
  | "UNWRAP"
  | "BRIDGE"
  | "PRIORITY"
  | "DUTCH_V3"
  | "QUICKROUTE"
  | "CHAINED";

interface SimulationMetadata {
  enabled: true;
  reason: string;
  chainId: number;
  chainName: string;
}

interface SupportedChainRecord {
  chainId: number;
  name?: string;
  supportsSwaps: boolean;
  supportsLp: boolean;
}

const KNOWN_ROUTING_TYPES = new Set<TradeRoutingType>([
  "CLASSIC",
  "DUTCH_LIMIT",
  "DUTCH_V2",
  "LIMIT_ORDER",
  "WRAP",
  "UNWRAP",
  "BRIDGE",
  "PRIORITY",
  "DUTCH_V3",
  "QUICKROUTE",
  "CHAINED"
]);

function normalizeRoutingType(input?: string): TradeRoutingType {
  const candidate = input?.toUpperCase() as TradeRoutingType | undefined;
  if (candidate && KNOWN_ROUTING_TYPES.has(candidate)) return candidate;
  return "CLASSIC";
}

function normalizeIntent(input?: string): TradeIntent {
  return input?.toLowerCase() === "order" ? "order" : "swap";
}

function readQuoteRequestId(quoteResponse?: Record<string, unknown>): string | undefined {
  const value = quoteResponse?.requestId;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readQuoteAmountOut(quoteResponse?: Record<string, unknown>): string {
  if (!quoteResponse) return "0";
  const quote = quoteResponse.quote as { output?: { amount?: string } } | undefined;
  if (quote?.output?.amount) return quote.output.amount;
  const classicQuote = quoteResponse.classicQuote as { outputAmount?: string } | undefined;
  if (classicQuote?.outputAmount) return classicQuote.outputAmount;
  return "0";
}

function readSimulationFromQuote(quoteResponse?: Record<string, unknown>): SimulationMetadata | undefined {
  const simulation = quoteResponse?.simulation;
  if (!simulation || typeof simulation !== "object") return undefined;
  const record = simulation as Record<string, unknown>;
  const chainId = Number(record.chainId);
  const reason = typeof record.reason === "string" ? record.reason : undefined;
  const chainName = typeof record.chainName === "string" ? record.chainName : undefined;
  if (!Number.isFinite(chainId) || !reason || !chainName) return undefined;
  return {
    enabled: true,
    reason,
    chainId,
    chainName
  };
}

function extractSupportedChainIds(detail?: string): number[] {
  if (!detail) return [];
  const match = detail.match(/must be one of \[(.+)\]/);
  if (!match?.[1]) return [];
  return match[1]
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
}

function decodeUniswapError(cause: unknown): {
  status?: number;
  errorCode?: string;
  detail?: string;
} | undefined {
  if (!(cause instanceof Error)) return undefined;
  const match = cause.message.match(/^Uniswap request failed \((\d+)\) for [^:]+: (.+)$/);
  if (!match) return undefined;
  const status = Number(match[1]);
  const rawBody = match[2] ?? "";
  try {
    const parsed = JSON.parse(rawBody) as { errorCode?: string; detail?: string };
    return {
      status: Number.isFinite(status) ? status : undefined,
      errorCode: typeof parsed.errorCode === "string" ? parsed.errorCode : undefined,
      detail: typeof parsed.detail === "string" ? parsed.detail : rawBody
    };
  } catch {
    return {
      status: Number.isFinite(status) ? status : undefined,
      detail: rawBody
    };
  }
}

function isUnsupportedChainUpstreamError(cause: unknown): boolean {
  const upstream = decodeUniswapError(cause);
  return Boolean(
    upstream?.status === 400 &&
      upstream.errorCode === "RequestValidationError" &&
      upstream.detail?.includes('"tokenInChainId" must be one of')
  );
}

function randomHex(bytes = 32): string {
  return `0x${randomBytes(bytes).toString("hex")}`;
}

function simulateAmountOut(amountIn: string): string {
  try {
    const value = BigInt(amountIn);
    if (value <= 0n) return "0";
    return (value / 4000n).toString();
  } catch {
    return "0";
  }
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

function createSimulatedTradingAdapter(simulation: SimulationMetadata): TradingAdapter {
  return {
    async checkApproval() {
      return {
        needsApproval: false,
        approvalRequestId: `sim-approval-${Date.now()}`
      };
    },
    async quote(input) {
      const requestId = `sim-quote-${Date.now()}`;
      const amountOut = simulateAmountOut(input.amountIn);
      return {
        amountOut,
        quoteResponse: {
          requestId,
          routing: "SIMULATED",
          quote: {
            input: { token: input.tokenIn, amount: input.amountIn },
            output: { token: input.tokenOut, amount: amountOut }
          },
          simulation
        }
      };
    },
    async executeSwap(input) {
      const quoteRequestId =
        typeof input.quoteResponse.requestId === "string" ? input.quoteResponse.requestId : undefined;
      return {
        txHash: randomHex(32),
        status: "confirmed",
        quoteRequestId,
        swapRequestId: `sim-swap-${Date.now()}`
      };
    }
  };
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

function createTradingAdapterForResolution(
  env: AgentServerEnv,
  resolution: SwapModeResolution
): { adapter?: TradingAdapter; simulation?: SimulationMetadata } {
  const simulation = buildSimulationMetadata(resolution);
  if (simulation) {
    return {
      adapter: createSimulatedTradingAdapter(simulation),
      simulation
    };
  }

  if (!isLiveExecutionConfigured(env)) {
    return { adapter: undefined };
  }

  return {
    adapter: new RealTradingAdapter({
      privateKey: env.agentPrivateKey,
      executionRpcUrl: env.executionRpcUrl,
      uniswapApiKey: env.uniswapApiKey,
      uniswapApiUrl: env.uniswapApiUrl || undefined
    })
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

export async function registerTradeExecutionRoutes(
  app: FastifyInstance,
  deps: TradeExecutionDeps
): Promise<void> {
  const paymentAdapter = createPaymentAdapter({
    mode: deps.env.kitePaymentMode,
    facilitatorUrl: deps.facilitatorUrl,
    network: deps.network
  });

  app.get("/trade/supported-chains", async () => {
    const profileChains: SupportedChainRecord[] = [MONAD_CHAIN_ID, MONAD_TESTNET_CHAIN_ID].map(
      (chainId) => {
        const profile = getExecutionChainProfile(chainId);
        return {
          chainId: profile.chainId,
          name: profile.name,
          supportsSwaps: profile.supportsLiveTradingApi,
          supportsLp: profile.supportsLiveTradingApi
        };
      }
    );

    let chains: SupportedChainRecord[] = [...profileChains];
    if (isLiveExecutionConfigured(deps.env)) {
      try {
        const liveAdapter = new RealTradingAdapter({
          privateKey: deps.env.agentPrivateKey,
          executionRpcUrl: deps.env.executionRpcUrl,
          uniswapApiKey: deps.env.uniswapApiKey,
          uniswapApiUrl: deps.env.uniswapApiUrl || undefined
        });
        const liveChains = await liveAdapter.supportedChains();
        const merged = new Map<number, SupportedChainRecord>();
        for (const chain of chains) merged.set(chain.chainId, chain);
        for (const chain of liveChains.chains) {
          const existing = merged.get(chain.chainId);
          if (!existing) {
            merged.set(chain.chainId, chain);
            continue;
          }
          merged.set(chain.chainId, {
            chainId: chain.chainId,
            name: chain.name ?? existing.name,
            supportsSwaps: chain.supportsSwaps,
            supportsLp: chain.supportsLp
          });
        }
        chains = Array.from(merged.values()).sort((a, b) => a.chainId - b.chainId);
      } catch {
        // fall through to profile-backed defaults
      }
    }

    const effectiveModeByChain: Record<string, "live" | "simulated"> = {};
    for (const chain of chains) {
      const mode = resolveSwapModeForChain(deps.env, chain.chainId);
      effectiveModeByChain[String(chain.chainId)] = mode.effectiveMode;
    }

    const executionProfile = getExecutionChainProfile(deps.env.executionChainId);
    const monadTestnet = chains.find((chain) => chain.chainId === MONAD_TESTNET_CHAIN_ID);
    const executionChain = chains.find((chain) => chain.chainId === deps.env.executionChainId);

    return {
      chains,
      executionChainId: deps.env.executionChainId,
      executionChainSupportedForSwap: Boolean(executionChain?.supportsSwaps),
      monadSupportedForSwap: Boolean(monadTestnet?.supportsSwaps),
      monadSupportedForLp: Boolean(monadTestnet?.supportsLp),
      executionMode: deps.env.swapExecutionMode,
      effectiveModeByChain,
      defaultTradePair: {
        tokenIn: executionProfile.defaultTradePair.tokenIn,
        tokenOut: executionProfile.defaultTradePair.tokenOut,
        intent: executionProfile.defaultTradePair.intent
      }
    };
  });

  app.post("/trade/quote", async (request, reply) => {
    const allowed = await requireX402Payment(request, reply, {
      store: deps.store,
      paymentAdapter,
      network: deps.network,
      payToAddress: deps.payToAddress,
      paymentAssetAddress: deps.paymentAssetAddress,
      paymentAssetDecimals: deps.paymentAssetDecimals,
      budgetResetTimeZone: deps.budgetResetTimeZone,
      enforceLocalBudget: false,
      fixedCostUsd: deps.quoteCostUsd,
      onPayment(payment) {
        deps.wsHub.broadcast({ type: "payment.update", payment });
      },
      onActivity(event) {
        deps.wsHub.broadcast({ type: "activity.new", event });
      }
    });
    if (!allowed) return;

    const body = (request.body as {
      tokenIn?: string;
      tokenOut?: string;
      amountIn?: string;
      chainId?: number;
      walletAddress?: string;
      intent?: string;
      routingType?: string;
      slippageTolerance?: number;
      urgency?: "normal" | "fast";
      autoSlippage?: boolean;
    } | undefined) ?? {};

    const chainId = body.chainId ?? deps.env.executionChainId;
    const resolution = resolveSwapModeForChain(deps.env, chainId);
    if (resolution.requestedMode === "live" && resolution.effectiveMode === "simulated") {
      return reply.status(400).send(unsupportedLiveModePayload(resolution, chainId));
    }

    const profile = getExecutionChainProfile(chainId);
    const tokenIn = body.tokenIn ?? profile.defaultTradePair.tokenIn;
    const tokenOut = body.tokenOut ?? profile.defaultTradePair.tokenOut;
    const amountIn = body.amountIn ?? "1";
    const intent = normalizeIntent(body.intent ?? profile.defaultTradePair.intent);
    const routingType = normalizeRoutingType(body.routingType);

    const { adapter: tradingAdapter, simulation } = createTradingAdapterForResolution(deps.env, resolution);
    if (!tradingAdapter) {
      return reply.status(503).send({
        code: "TRADING_NOT_CONFIGURED",
        message: "Set AGENT_PRIVATE_KEY, EXECUTION_RPC_URL, and UNISWAP_API_KEY"
      });
    }

    const agents = await deps.store.listAgents();
    const agent = agents[0];
    const walletAddress = body.walletAddress ?? agent?.eoaAddress ?? "";

    async function executeQuote(adapter: TradingAdapter, simulationMeta?: SimulationMetadata) {
      const approval = await adapter.checkApproval({
        walletAddress,
        token: tokenIn,
        amount: amountIn,
        chainId
      });

      const quoteResult = await adapter.quote({
        tokenIn,
        tokenOut,
        amountIn,
        chainId,
        swapper: walletAddress,
        intent,
        routingType,
        slippageTolerance: body.slippageTolerance,
        urgency: body.urgency,
        autoSlippage: body.autoSlippage
      });

      return {
        approvalRequestId: approval.approvalRequestId ?? "",
        requestId: String(quoteResult.quoteResponse.requestId ?? ""),
        quoteId: String(quoteResult.quoteResponse.requestId ?? ""),
        routing: String((quoteResult.quoteResponse.routing as string | undefined) ?? routingType),
        intent,
        routingType,
        amountOut: quoteResult.amountOut,
        quote: quoteResult.quoteResponse,
        ...(simulationMeta ? { simulation: simulationMeta } : {})
      };
    }

    try {
      return await executeQuote(tradingAdapter, simulation);
    } catch (cause) {
      if (
        resolution.requestedMode === "auto" &&
        resolution.effectiveMode === "live" &&
        isUnsupportedChainUpstreamError(cause)
      ) {
        const fallbackResolution: SwapModeResolution = {
          ...resolution,
          effectiveMode: "simulated",
          reason: `upstream rejected chainId ${chainId}; auto-fallback to simulation`
        };
        const fallback = createTradingAdapterForResolution(deps.env, fallbackResolution);
        if (fallback.adapter && fallback.simulation) {
          return await executeQuote(fallback.adapter, fallback.simulation);
        }
      }

      const upstream = decodeUniswapError(cause);
      if (isUnsupportedChainUpstreamError(cause)) {
        return reply.status(400).send({
          code: "UNSUPPORTED_CHAIN",
          message: `Uniswap /quote does not currently accept chainId ${chainId}.`,
          details: {
            chainId,
            supportedChainIds: extractSupportedChainIds(upstream?.detail),
            upstreamDetail: upstream?.detail
          }
        });
      }
      throw cause;
    }
  });

  app.post("/trade/execute", async (request, reply) => {
    const body = (request.body as {
      quoteResponse?: Record<string, unknown>;
      chainId?: number;
      agentId?: string;
      tokenIn?: string;
      tokenOut?: string;
      amountIn?: string;
      signature?: string;
      intent?: string;
      routingType?: string;
    } | undefined) ?? {};

    if (!body.quoteResponse) {
      return reply.status(400).send({
        code: "MISSING_QUOTE",
        message: "quoteResponse is required — call /trade/quote first"
      });
    }

    const quoteSimulation = readSimulationFromQuote(body.quoteResponse);
    const chainId = body.chainId ?? quoteSimulation?.chainId ?? deps.env.executionChainId;
    const resolution = quoteSimulation
      ? {
          requestedMode: deps.env.swapExecutionMode,
          effectiveMode: "simulated" as const,
          reason: quoteSimulation.reason,
          profile: getExecutionChainProfile(chainId)
        }
      : resolveSwapModeForChain(deps.env, chainId);

    if (resolution.requestedMode === "live" && resolution.effectiveMode === "simulated") {
      return reply.status(400).send(unsupportedLiveModePayload(resolution, chainId));
    }

    if (!deps.env.allowServerSigning && resolution.effectiveMode !== "simulated") {
      return reply.status(403).send({
        code: "SERVER_SIGNING_DISABLED",
        message: "Set ALLOW_SERVER_SIGNING=true to enable /trade/execute"
      });
    }

    const allowed = await requireX402Payment(request, reply, {
      store: deps.store,
      paymentAdapter,
      network: deps.network,
      payToAddress: deps.payToAddress,
      paymentAssetAddress: deps.paymentAssetAddress,
      paymentAssetDecimals: deps.paymentAssetDecimals,
      budgetResetTimeZone: deps.budgetResetTimeZone,
      enforceLocalBudget: false,
      fixedCostUsd: deps.executeCostUsd,
      onPayment(payment) {
        deps.wsHub.broadcast({ type: "payment.update", payment });
      },
      onActivity(event) {
        deps.wsHub.broadcast({ type: "activity.new", event });
      }
    });
    if (!allowed) return;

    const { adapter: tradingAdapter, simulation } = createTradingAdapterForResolution(deps.env, resolution);
    const attestationAdapter = createAttestationAdapterForResolution(deps.env, resolution);

    if (!tradingAdapter) {
      return reply.status(503).send({
        code: "TRADING_NOT_CONFIGURED",
        message: "Set AGENT_PRIVATE_KEY, EXECUTION_RPC_URL, and UNISWAP_API_KEY"
      });
    }
    if (!attestationAdapter) {
      return reply.status(503).send({
        code: "ATTESTATION_NOT_CONFIGURED",
        message: "Set AGENT_PRIVATE_KEY, KITE_RPC_URL, and SERVICE_REGISTRY_ADDRESS"
      });
    }

    const agents = await deps.store.listAgents();
    const agentId = body.agentId ?? agents[0]?.id;
    if (!agentId) {
      return reply.status(400).send({
        code: "NO_AGENT",
        message: "No agent available"
      });
    }

    const profile = getExecutionChainProfile(chainId);
    const tokenIn = body.tokenIn ?? profile.defaultTradePair.tokenIn;
    const tokenOut = body.tokenOut ?? profile.defaultTradePair.tokenOut;
    const amountIn = body.amountIn ?? "1";
    const intent = normalizeIntent(body.intent ?? profile.defaultTradePair.intent);
    const routingType = normalizeRoutingType(body.routingType);
    const quoteRequestId = readQuoteRequestId(body.quoteResponse);
    const amountOut = readQuoteAmountOut(body.quoteResponse);
    const executionChainName = resolution.profile.name;

    const trade = await deps.store.createTrade({
      agentId,
      chainId,
      tokenIn,
      tokenOut,
      amountIn,
      amountOut,
      routingType,
      intent,
      quoteRequestId,
      status: "signing",
      quoteResponse: body.quoteResponse
    });
    deps.wsHub.broadcast({ type: "trade.update", trade });

    const swap = await tradingAdapter.executeSwap({
      quoteResponse: body.quoteResponse,
      signature: body.signature
    });

    const confirmed = await deps.store.updateTradeStatus(trade.id, "confirmed", {
      executionTxHash: swap.txHash,
      quoteRequestId: swap.quoteRequestId ?? quoteRequestId,
      swapRequestId: swap.swapRequestId
    });
    if (confirmed) deps.wsHub.broadcast({ type: "trade.update", trade: confirmed });

    const swapEvent = await deps.store.addActivity(agentId, "trade.swap_confirmed", executionChainName, {
      tradeId: trade.id,
      txHash: swap.txHash,
      quoteRequestId: swap.quoteRequestId ?? "",
      swapRequestId: swap.swapRequestId ?? "",
      simulated: resolution.effectiveMode === "simulated"
    });
    deps.wsHub.broadcast({ type: "activity.new", event: swapEvent });

    let attestationTxHash: string;
    try {
      if (attestationAdapter.recordService) {
        const attested = await attestationAdapter.recordService({
          serviceType: "trade_execute",
          sourceChainId: chainId,
          sourceTxHashOrRef: swap.txHash,
          tokenIn,
          tokenOut,
          amountIn,
          amountOut: String(confirmed?.amountOut ?? "0"),
          metadata: "x402-gated trade execution"
        });
        attestationTxHash = attested.attestationTxHash;
      } else {
        const attested = await attestationAdapter.recordTrade({
          sourceChainId: chainId,
          sourceTxHash: swap.txHash,
          tokenIn,
          tokenOut,
          amountIn,
          amountOut: String(confirmed?.amountOut ?? "0"),
          strategyReason: "x402-gated trade execution"
        });
        attestationTxHash = attested.attestationTxHash;
      }
    } catch (error) {
      await deps.store.updateTradeStatus(trade.id, "failed", {
        executionTxHash: swap.txHash,
        quoteRequestId: swap.quoteRequestId ?? quoteRequestId,
        swapRequestId: swap.swapRequestId
      });
      return reply.status(502).send({
        code: "ATTESTATION_FAILED",
        message: error instanceof Error ? error.message : "Attestation failed",
        tradeId: trade.id,
        txHash: swap.txHash
      });
    }

    await deps.store.updateTradeStatus(trade.id, "confirmed", {
      executionTxHash: swap.txHash,
      kiteAttestationTx: attestationTxHash,
      quoteRequestId: swap.quoteRequestId ?? quoteRequestId,
      swapRequestId: swap.swapRequestId
    });

    const attestEvent = await deps.store.addActivity(agentId, "trade.attested", "kite-testnet", {
      tradeId: trade.id,
      sourceTxHash: swap.txHash,
      attestationTxHash
    });
    deps.wsHub.broadcast({ type: "activity.new", event: attestEvent });

    return {
      tradeId: trade.id,
      txHash: swap.txHash,
      attestationTxHash,
      status: "confirmed",
      quoteRequestId: swap.quoteRequestId,
      swapRequestId: swap.swapRequestId,
      ...(simulation ? { simulation } : {})
    };
  });
}
