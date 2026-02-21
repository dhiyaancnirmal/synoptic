import type { FastifyInstance } from "fastify";
import type { RuntimeStoreContract } from "../state/runtime-store.js";
import { WsHub } from "../ws/hub.js";
import { RealTradingAdapter, RealAttestationAdapter, WMON, USDC_MONAD, MONAD_TESTNET_CHAIN_ID } from "@synoptic/agent-core";
import { createPaymentAdapter } from "../oracle/payment-adapter.js";
import { requireX402Payment } from "../oracle/middleware.js";
import type { AgentServerEnv } from "../env.js";

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

function createTradingAdapter(env: AgentServerEnv): RealTradingAdapter | undefined {
  if (!env.agentPrivateKey || !env.executionRpcUrl || !env.uniswapApiKey) {
    return undefined;
  }
  return new RealTradingAdapter({
    privateKey: env.agentPrivateKey,
    executionRpcUrl: env.executionRpcUrl,
    uniswapApiKey: env.uniswapApiKey
  });
}

function createAttestationAdapter(env: AgentServerEnv): RealAttestationAdapter | undefined {
  if (!env.agentPrivateKey || !env.kiteRpcUrl || !env.registryAddress) {
    return undefined;
  }
  return new RealAttestationAdapter({
    privateKey: env.agentPrivateKey,
    kiteRpcUrl: env.kiteRpcUrl,
    serviceRegistryAddress: env.registryAddress
  });
}

export async function registerTradeExecutionRoutes(
  app: FastifyInstance,
  deps: TradeExecutionDeps
): Promise<void> {
  const paymentAdapter = createPaymentAdapter({
    mode: deps.env.paymentMode,
    facilitatorUrl: deps.facilitatorUrl,
    network: deps.network
  });

  app.get("/trade/supported-chains", async (_request, reply) => {
    const tradingAdapter = createTradingAdapter(deps.env);
    if (!tradingAdapter || typeof tradingAdapter.supportedChains !== "function") {
      return reply.status(503).send({
        code: "TRADING_NOT_CONFIGURED",
        message: "Set AGENT_PRIVATE_KEY, EXECUTION_RPC_URL, and UNISWAP_API_KEY"
      });
    }
    const payload = await tradingAdapter.supportedChains();
    const monad = payload.chains.find((chain) => chain.chainId === MONAD_TESTNET_CHAIN_ID);
    return {
      chains: payload.chains,
      monadSupportedForSwap: Boolean(monad?.supportsSwaps),
      monadSupportedForLp: Boolean(monad?.supportsLp)
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
      onPayment(payment) {
        deps.wsHub.broadcast({ type: "payment.update", payment });
      },
      onActivity(event) {
        deps.wsHub.broadcast({ type: "activity.new", event });
      }
    });
    if (!allowed) return;

    const tradingAdapter = createTradingAdapter(deps.env);
    if (!tradingAdapter) {
      return reply.status(503).send({
        code: "TRADING_NOT_CONFIGURED",
        message: "Set AGENT_PRIVATE_KEY, EXECUTION_RPC_URL, and UNISWAP_API_KEY"
      });
    }

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

    const tokenIn = body.tokenIn ?? WMON;
    const tokenOut = body.tokenOut ?? USDC_MONAD;
    const amountIn = body.amountIn ?? "1";
    const chainId = body.chainId ?? deps.env.executionChainId;
    const intent = normalizeIntent(body.intent);
    const routingType = normalizeRoutingType(body.routingType);

    const agents = await deps.store.listAgents();
    const agent = agents[0];
    const walletAddress = body.walletAddress ?? agent?.eoaAddress ?? "";

    try {
      const approval = await tradingAdapter.checkApproval({
        walletAddress,
        token: tokenIn,
        amount: amountIn,
        chainId
      });

      const quoteResult = await tradingAdapter.quote({
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
        quote: quoteResult.quoteResponse
      };
    } catch (cause) {
      const upstream = decodeUniswapError(cause);
      if (
        upstream?.status === 400 &&
        upstream.errorCode === "RequestValidationError" &&
        upstream.detail?.includes("\"tokenInChainId\" must be one of")
      ) {
        return reply.status(400).send({
          code: "UNSUPPORTED_CHAIN",
          message: `Uniswap /quote does not currently accept chainId ${chainId}.`,
          details: {
            chainId,
            supportedChainIds: extractSupportedChainIds(upstream.detail),
            upstreamDetail: upstream.detail
          }
        });
      }
      throw cause;
    }
  });

  app.post("/trade/execute", async (request, reply) => {
    const allowed = await requireX402Payment(request, reply, {
      store: deps.store,
      paymentAdapter,
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

    const tradingAdapter = createTradingAdapter(deps.env);
    const attestationAdapter = createAttestationAdapter(deps.env);

    if (!tradingAdapter) {
      return reply.status(503).send({
        code: "TRADING_NOT_CONFIGURED",
        message: "Set AGENT_PRIVATE_KEY, EXECUTION_RPC_URL, and UNISWAP_API_KEY"
      });
    }

    const body = (request.body as {
      quoteResponse?: Record<string, unknown>;
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

    const agents = await deps.store.listAgents();
    const agentId = body.agentId ?? agents[0]?.id;
    if (!agentId) {
      return reply.status(400).send({
        code: "NO_AGENT",
        message: "No agent available"
      });
    }

    const tokenIn = body.tokenIn ?? WMON;
    const tokenOut = body.tokenOut ?? USDC_MONAD;
    const amountIn = body.amountIn ?? "1";
    const intent = normalizeIntent(body.intent);
    const routingType = normalizeRoutingType(body.routingType);
    const quoteRequestId = readQuoteRequestId(body.quoteResponse);
    const amountOut = readQuoteAmountOut(body.quoteResponse);

    const trade = await deps.store.createTrade({
      agentId,
      chainId: MONAD_TESTNET_CHAIN_ID,
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

    const swapEvent = await deps.store.addActivity(agentId, "trade.swap_confirmed", "monad-testnet", {
      tradeId: trade.id,
      txHash: swap.txHash,
      quoteRequestId: swap.quoteRequestId ?? "",
      swapRequestId: swap.swapRequestId ?? ""
    });
    deps.wsHub.broadcast({ type: "activity.new", event: swapEvent });

    let attestationTxHash: string | undefined;
    if (attestationAdapter) {
      try {
        const attested = await attestationAdapter.recordTrade({
          sourceChainId: MONAD_TESTNET_CHAIN_ID,
          sourceTxHash: swap.txHash,
          tokenIn,
          tokenOut,
          amountIn,
          amountOut: String(confirmed?.amountOut ?? "0"),
          strategyReason: "x402-gated trade execution"
        });
        attestationTxHash = attested.attestationTxHash;

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
      } catch {
        // Attestation failure is non-fatal for trade execution
      }
    }

    return {
      tradeId: trade.id,
      txHash: swap.txHash,
      attestationTxHash,
      status: "confirmed",
      quoteRequestId: swap.quoteRequestId,
      swapRequestId: swap.swapRequestId
    };
  });
}
