import type { FastifyInstance } from "fastify";
import type { RuntimeStoreContract } from "../state/runtime-store.js";
import { WsHub } from "../ws/hub.js";
import {
  RealTradingAdapter,
  RealAttestationAdapter,
  UniswapClient,
  WMON,
  USDC_MONAD,
  MONAD_TESTNET_CHAIN_ID
} from "@synoptic/agent-core";
import { requireX402Payment } from "../oracle/middleware.js";
import type { AgentServerEnv } from "../env.js";
import { createLegacyPaymentAdapter } from "./payment-adapters.js";

interface TradeExecutionDeps {
  store: RuntimeStoreContract;
  wsHub: WsHub;
  env: AgentServerEnv;
  scheme: string;
  network: string;
  payToAddress: string;
  paymentAssetAddress: string;
  paymentAssetDecimals: number;
  budgetResetTimeZone: string;
}

function createServerSigningTradingAdapter(
  env: AgentServerEnv
): RealTradingAdapter | undefined {
  if (!env.agentPrivateKey || !env.executionRpcUrl || !env.uniswapApiKey) {
    return undefined;
  }

  return new RealTradingAdapter({
    privateKey: env.agentPrivateKey,
    executionRpcUrl: env.executionRpcUrl,
    uniswapApiKey: env.uniswapApiKey
  });
}

function createQuoteClient(env: AgentServerEnv): UniswapClient | undefined {
  if (!env.uniswapApiKey) return undefined;
  return new UniswapClient(env.uniswapApiKey);
}

function createAttestationAdapter(
  env: AgentServerEnv
): RealAttestationAdapter | undefined {
  if (!env.agentPrivateKey || !env.kiteRpcUrl || !env.registryAddress) {
    return undefined;
  }

  return new RealAttestationAdapter({
    privateKey: env.agentPrivateKey,
    kiteRpcUrl: env.kiteRpcUrl,
    serviceRegistryAddress: env.registryAddress
  });
}

function normalizeSwapRequest(
  quoteResponse: Record<string, unknown>,
  signature?: string
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(quoteResponse)) {
    if (value !== null && value !== undefined) {
      out[key] = value;
    }
  }
  if (signature) {
    out.signature = signature;
  }
  return out;
}

export async function registerTradeExecutionRoutes(
  app: FastifyInstance,
  deps: TradeExecutionDeps
): Promise<void> {
  const paymentAdapter = createLegacyPaymentAdapter(deps.env);

  app.post("/trade/quote", async (request, reply) => {
    const allowed = await requireX402Payment(request, reply, {
      store: deps.store,
      paymentAdapter,
      paymentScheme: deps.scheme,
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

    const quoteClient = createQuoteClient(deps.env);
    if (!quoteClient) {
      return reply.status(503).send({
        code: "TRADING_NOT_CONFIGURED",
        message: "Set UNISWAP_API_KEY"
      });
    }

    const body =
      (request.body as {
        tokenIn?: string;
        tokenOut?: string;
        amountIn?: string;
        chainId?: number;
        walletAddress?: string;
      } | undefined) ?? {};

    const tokenIn = body.tokenIn ?? WMON;
    const tokenOut = body.tokenOut ?? USDC_MONAD;
    const amountIn = body.amountIn ?? "1";
    const chainId = body.chainId ?? deps.env.executionChainId;

    const agents = await deps.store.listAgents();
    const agent = agents[0];
    const walletAddress = body.walletAddress ?? agent?.eoaAddress ?? "";

    if (!walletAddress) {
      return reply.status(400).send({
        code: "MISSING_WALLET_ADDRESS",
        message: "walletAddress is required"
      });
    }

    const approval = await quoteClient.checkApproval({
      walletAddress,
      token: tokenIn,
      amount: amountIn,
      chainId
    });

    const quoteResult = await quoteClient.quote({
      tokenIn,
      tokenOut,
      amount: amountIn,
      tokenInChainId: String(chainId),
      tokenOutChainId: String(chainId),
      type: "EXACT_INPUT",
      swapper: walletAddress
    });

    const amountOut =
      (quoteResult.quote &&
      typeof quoteResult.quote === "object" &&
      quoteResult.quote &&
      typeof (quoteResult.quote as { output?: { amount?: unknown } }).output?.amount ===
        "string"
        ? ((quoteResult.quote as { output: { amount: string } }).output.amount as string)
        : typeof (quoteResult.classicQuote as { outputAmount?: unknown } | undefined)
            ?.outputAmount === "string"
          ? ((quoteResult.classicQuote as { outputAmount: string }).outputAmount as string)
          : "0");

    return {
      approvalRequestId: approval.requestId ?? "",
      quoteId: String(quoteResult.requestId ?? ""),
      amountOut,
      quote: quoteResult
    };
  });

  app.post("/trade/execute", async (request, reply) => {
    if (!deps.env.allowServerSigning) {
      return reply.status(403).send({
        code: "SERVER_SIGNING_DISABLED",
        message:
          "Server-side signing is disabled. Use /trade/execute-intent + /trade/confirm + /trade/attest."
      });
    }

    const allowed = await requireX402Payment(request, reply, {
      store: deps.store,
      paymentAdapter,
      paymentScheme: deps.scheme,
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

    const tradingAdapter = createServerSigningTradingAdapter(deps.env);
    const attestationAdapter = createAttestationAdapter(deps.env);

    if (!tradingAdapter) {
      return reply.status(503).send({
        code: "TRADING_NOT_CONFIGURED",
        message: "Set AGENT_PRIVATE_KEY, EXECUTION_RPC_URL, and UNISWAP_API_KEY"
      });
    }

    const body =
      (request.body as {
        quoteResponse?: Record<string, unknown>;
        agentId?: string;
        tokenIn?: string;
        tokenOut?: string;
        amountIn?: string;
        signature?: string;
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

    const trade = await deps.store.createTrade({
      agentId,
      chainId: MONAD_TESTNET_CHAIN_ID,
      tokenIn,
      tokenOut,
      amountIn,
      amountOut: "0",
      routingType: "BEST_PRICE",
      status: "signing",
      quoteResponse: body.quoteResponse
    });
    deps.wsHub.broadcast({ type: "trade.update", trade });

    const swap = await tradingAdapter.executeSwap({
      quoteResponse: normalizeSwapRequest(body.quoteResponse, body.signature),
      signature: body.signature
    });

    const confirmed = await deps.store.updateTradeStatus(trade.id, "confirmed", {
      executionTxHash: swap.txHash
    });
    if (confirmed) deps.wsHub.broadcast({ type: "trade.update", trade: confirmed });

    const swapEvent = await deps.store.addActivity(
      agentId,
      "trade.swap_confirmed",
      "monad-testnet",
      {
        tradeId: trade.id,
        txHash: swap.txHash,
        quoteRequestId: swap.quoteRequestId ?? "",
        swapRequestId: swap.swapRequestId ?? ""
      }
    );
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
          kiteAttestationTx: attestationTxHash
        });

        const attestEvent = await deps.store.addActivity(
          agentId,
          "trade.attested",
          "kite-testnet",
          {
            tradeId: trade.id,
            sourceTxHash: swap.txHash,
            attestationTxHash
          }
        );
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
