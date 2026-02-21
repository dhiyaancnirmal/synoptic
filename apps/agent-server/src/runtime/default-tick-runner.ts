import { randomBytes } from "node:crypto";
import {
  RealAttestationAdapter,
  RealTradingAdapter,
  MomentumStrategy,
  RebalanceStrategy,
  getExecutionChainProfile,
  type TradingAdapter,
  type AttestationAdapter
} from "@synoptic/agent-core";
import type { ActivityEvent, Trade } from "@synoptic/types";
import type { RuntimeStoreContract } from "../state/runtime-store.js";
import type { AgentTickRunner } from "./agent-loop.js";
import {
  isLiveExecutionConfigured,
  resolveSwapModeForChain,
  type SwapModeResolution
} from "../trading/execution-mode.js";

const DEFAULT_AMOUNT_IN = "1";

async function priceWindowForStrategy(
  store: RuntimeStoreContract,
  pair: string
): Promise<number[]> {
  const snapshots = await store.listRecentPriceSnapshots(pair, new Date(Date.now() - 24 * 60 * 60 * 1000));
  const prices = snapshots
    .map((snapshot) => Number(snapshot.price))
    .filter((price) => Number.isFinite(price) && price > 0)
    .slice(0, 10)
    .reverse();
  if (prices.length >= 3) return prices;
  return [100, 101, 102];
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

function createSimulatedTradingAdapter(resolution: SwapModeResolution): TradingAdapter {
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
          simulation: {
            enabled: true,
            reason: resolution.reason,
            chainId: resolution.profile.chainId,
            chainName: resolution.profile.name
          }
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
    async recordTrade() {
      return { attestationTxHash: randomHex(32) };
    }
  };
}

export function createDefaultTickRunner(input: {
  store: RuntimeStoreContract;
  privateKey: string;
  executionRpcUrl: string;
  executionChainId: number;
  executionChainName: string;
  swapExecutionMode: "auto" | "live" | "simulated";
  simulatedChainIds: number[];
  simulateOnchain: boolean;
  kiteRpcUrl: string;
  uniswapApiKey: string;
  uniswapApiUrl?: string;
  registryAddress: string;
  onTrade?: (trade: Trade) => void;
  onActivity?: (event: ActivityEvent) => void;
}): AgentTickRunner {
  const resolution = resolveSwapModeForChain(
    {
      swapExecutionMode: input.swapExecutionMode,
      simulatedChainIds: input.simulatedChainIds,
      simulateOnchain: input.simulateOnchain
    },
    input.executionChainId
  );

  if (resolution.requestedMode === "live" && resolution.effectiveMode === "simulated") {
    throw new Error(
      `SWAP_EXECUTION_MODE=live is not supported for execution chain ${input.executionChainId}: ${resolution.reason}`
    );
  }

  const profile = getExecutionChainProfile(input.executionChainId);
  const executionChainName = input.executionChainName || profile.name;
  const defaultTokenIn = profile.defaultTradePair.tokenIn;
  const defaultTokenOut = profile.defaultTradePair.tokenOut;

  const trading: TradingAdapter | undefined =
    resolution.effectiveMode === "simulated"
      ? createSimulatedTradingAdapter(resolution)
      : isLiveExecutionConfigured({
            agentPrivateKey: input.privateKey,
            executionRpcUrl: input.executionRpcUrl,
            uniswapApiKey: input.uniswapApiKey
          })
        ? new RealTradingAdapter({
            privateKey: input.privateKey,
            executionRpcUrl: input.executionRpcUrl,
            uniswapApiKey: input.uniswapApiKey,
            uniswapApiUrl: input.uniswapApiUrl
          })
        : undefined;

  const attestation: AttestationAdapter | undefined =
    resolution.effectiveMode === "simulated"
      ? createSimulatedAttestationAdapter()
      : input.privateKey && input.kiteRpcUrl && input.registryAddress
        ? new RealAttestationAdapter({
            privateKey: input.privateKey,
            kiteRpcUrl: input.kiteRpcUrl,
            serviceRegistryAddress: input.registryAddress
          })
        : undefined;

  const momentum = new MomentumStrategy();
  const rebalance = new RebalanceStrategy();

  return async ({ agentId }) => {
    if (!trading) {
      throw new Error("trading_not_configured");
    }

    const agent = await input.store.getAgent(agentId);
    if (!agent) {
      throw new Error(`agent_not_found:${agentId}`);
    }

    const strategy = agent.strategy === "rebalance" ? rebalance : momentum;
    const signal = strategy.evaluate({ prices: await priceWindowForStrategy(input.store, "ETH/USDT") });
    const signalEvent = await input.store.addActivity(agentId, "strategy.signal", executionChainName, {
      strategy: agent.strategy ?? "momentum",
      action: signal.action,
      reason: signal.reason
    });
    input.onActivity?.(signalEvent);

    if (signal.action === "hold") {
      const holdEvent = await input.store.addActivity(agentId, "trade.skipped", executionChainName, {
        reason: signal.reason
      });
      input.onActivity?.(holdEvent);
      return { detail: `hold:${signal.reason}` };
    }

    const trade = await input.store.createTrade({
      agentId,
      chainId: input.executionChainId,
      tokenIn: defaultTokenIn,
      tokenOut: defaultTokenOut,
      amountIn: DEFAULT_AMOUNT_IN,
      amountOut: "0",
      routingType: "BEST_PRICE",
      status: "quoting",
      strategyReason: signal.reason,
      quoteRequest: {
        pair: "MON/WMON",
        amountIn: DEFAULT_AMOUNT_IN
      }
    });
    input.onTrade?.(trade);

    let currentTrade = trade;

    try {
      const approval = await trading.checkApproval({
        walletAddress: agent.eoaAddress,
        token: defaultTokenIn,
        amount: DEFAULT_AMOUNT_IN,
        chainId: input.executionChainId
      });
      const approvalActivity = await input.store.addActivity(
        agentId,
        "trade.approval_checked",
        executionChainName,
        {
          tradeId: currentTrade.id,
          approvalRequestId: approval.approvalRequestId ?? "",
          needsApproval: approval.needsApproval
        }
      );
      input.onActivity?.(approvalActivity);

      if (approval.needsApproval) {
        const approving = await input.store.updateTradeStatus(currentTrade.id, "approving");
        if (!approving) throw new Error(`trade_not_found:${currentTrade.id}`);
        currentTrade = approving;
        input.onTrade?.(currentTrade);
      }

      const quote = await trading.quote({
        tokenIn: defaultTokenIn,
        tokenOut: defaultTokenOut,
        amountIn: DEFAULT_AMOUNT_IN,
        chainId: input.executionChainId,
        swapper: agent.eoaAddress
      });
      const quoteActivity = await input.store.addActivity(agentId, "trade.quote_received", executionChainName, {
        tradeId: currentTrade.id,
        approvalRequestId: approval.approvalRequestId ?? "",
        quoteRequestId: String(quote.quoteResponse.requestId ?? ""),
        amountOut: quote.amountOut,
        simulated: resolution.effectiveMode === "simulated"
      });
      input.onActivity?.(quoteActivity);

      const signing = await input.store.updateTradeStatus(currentTrade.id, "signing");
      if (!signing) throw new Error(`trade_not_found:${currentTrade.id}`);
      currentTrade = signing;
      input.onTrade?.(currentTrade);

      const swap = await trading.executeSwap({ quoteResponse: quote.quoteResponse });
      const broadcast = await input.store.updateTradeStatus(currentTrade.id, "broadcast", {
        executionTxHash: swap.txHash
      });
      if (!broadcast) throw new Error(`trade_not_found:${currentTrade.id}`);
      currentTrade = broadcast;
      input.onTrade?.(currentTrade);

      const broadcastEvent = await input.store.addActivity(agentId, "trade.swap_broadcast", executionChainName, {
        tradeId: currentTrade.id,
        approvalRequestId: approval.approvalRequestId ?? "",
        quoteRequestId: swap.quoteRequestId ?? String(quote.quoteResponse.requestId ?? ""),
        swapRequestId: swap.swapRequestId ?? "",
        txHash: swap.txHash,
        simulated: resolution.effectiveMode === "simulated"
      });
      input.onActivity?.(broadcastEvent);

      const confirmed = await input.store.updateTradeStatus(currentTrade.id, "confirmed", {
        executionTxHash: swap.txHash
      });
      if (!confirmed) throw new Error(`trade_not_found:${currentTrade.id}`);
      currentTrade = confirmed;
      input.onTrade?.(currentTrade);

      const confirmedEvent = await input.store.addActivity(agentId, "trade.swap_confirmed", executionChainName, {
        tradeId: currentTrade.id,
        approvalRequestId: approval.approvalRequestId ?? "",
        quoteRequestId: swap.quoteRequestId ?? String(quote.quoteResponse.requestId ?? ""),
        swapRequestId: swap.swapRequestId ?? "",
        txHash: swap.txHash,
        simulated: resolution.effectiveMode === "simulated"
      });
      input.onActivity?.(confirmedEvent);

      if (attestation) {
        const attested = await attestation.recordTrade({
          sourceChainId: input.executionChainId,
          sourceTxHash: swap.txHash,
          tokenIn: defaultTokenIn,
          tokenOut: defaultTokenOut,
          amountIn: DEFAULT_AMOUNT_IN,
          amountOut: quote.amountOut,
          strategyReason: signal.reason
        });
        const attestedTrade = await input.store.updateTradeStatus(currentTrade.id, "confirmed", {
          executionTxHash: swap.txHash,
          kiteAttestationTx: attested.attestationTxHash
        });
        if (!attestedTrade) throw new Error(`trade_not_found:${currentTrade.id}`);
        currentTrade = attestedTrade;
        input.onTrade?.(currentTrade);

        const attestedEvent = await input.store.addActivity(agentId, "trade.attested", "kite-testnet", {
          tradeId: currentTrade.id,
          sourceTxHash: swap.txHash,
          attestationTxHash: attested.attestationTxHash
        });
        input.onActivity?.(attestedEvent);
      }

      return { detail: `trade:${currentTrade.id}:confirmed` };
    } catch (error) {
      const message = error instanceof Error ? error.message : "trade_execution_failed";
      const failed = await input.store.updateTradeStatus(currentTrade.id, "failed", {
        errorMessage: message
      });
      if (failed) input.onTrade?.(failed);
      const failedEvent = await input.store.addActivity(agentId, "trade.failed", executionChainName, {
        tradeId: currentTrade.id,
        message
      });
      input.onActivity?.(failedEvent);
      throw error;
    }
  };
}
