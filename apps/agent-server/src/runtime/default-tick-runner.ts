import {
  RealAttestationAdapter,
  RealTradingAdapter,
  MomentumStrategy,
  RebalanceStrategy,
  MONAD_TESTNET_CHAIN_ID,
  WMON,
  USDC_MONAD
} from "@synoptic/agent-core";
import type { ActivityEvent, Trade } from "@synoptic/types";
import type { RuntimeStoreContract } from "../state/runtime-store.js";
import type { AgentTickRunner } from "./agent-loop.js";

const DEFAULT_TOKEN_IN = WMON;
const DEFAULT_TOKEN_OUT = USDC_MONAD;
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

export function createDefaultTickRunner(input: {
  store: RuntimeStoreContract;
  privateKey: string;
  executionRpcUrl: string;
  kiteRpcUrl: string;
  uniswapApiKey: string;
  registryAddress: string;
  onTrade?: (trade: Trade) => void;
  onActivity?: (event: ActivityEvent) => void;
}): AgentTickRunner {
  const trading = new RealTradingAdapter({
    privateKey: input.privateKey,
    executionRpcUrl: input.executionRpcUrl,
    uniswapApiKey: input.uniswapApiKey
  });
  const attestation = new RealAttestationAdapter({
    privateKey: input.privateKey,
    kiteRpcUrl: input.kiteRpcUrl,
    serviceRegistryAddress: input.registryAddress
  });
  const momentum = new MomentumStrategy();
  const rebalance = new RebalanceStrategy();

  return async ({ agentId }) => {
    const agent = await input.store.getAgent(agentId);
    if (!agent) {
      throw new Error(`agent_not_found:${agentId}`);
    }

    const strategy = agent.strategy === "rebalance" ? rebalance : momentum;
    const signal = strategy.evaluate({ prices: await priceWindowForStrategy(input.store, "ETH/USDT") });
    const signalEvent = await input.store.addActivity(agentId, "strategy.signal", "monad-testnet", {
      strategy: agent.strategy ?? "momentum",
      action: signal.action,
      reason: signal.reason
    });
    input.onActivity?.(signalEvent);

    if (signal.action === "hold") {
      const holdEvent = await input.store.addActivity(agentId, "trade.skipped", "monad-testnet", {
        reason: signal.reason
      });
      input.onActivity?.(holdEvent);
      return { detail: `hold:${signal.reason}` };
    }

    const trade = await input.store.createTrade({
      agentId,
      chainId: MONAD_TESTNET_CHAIN_ID,
      tokenIn: DEFAULT_TOKEN_IN,
      tokenOut: DEFAULT_TOKEN_OUT,
      amountIn: DEFAULT_AMOUNT_IN,
      amountOut: "0",
      routingType: "BEST_PRICE",
      status: "quoting",
      strategyReason: signal.reason,
      quoteRequest: {
        pair: "ETH/USDT",
        amountIn: DEFAULT_AMOUNT_IN
      }
    });
    input.onTrade?.(trade);

    let currentTrade = trade;

    try {
      const approval = await trading.checkApproval({
        walletAddress: agent.eoaAddress,
        token: DEFAULT_TOKEN_IN,
        amount: DEFAULT_AMOUNT_IN,
        chainId: MONAD_TESTNET_CHAIN_ID
      });
      const approvalActivity = await input.store.addActivity(agentId, "trade.approval_checked", "monad-testnet", {
        tradeId: currentTrade.id,
        approvalRequestId: approval.approvalRequestId ?? "",
        needsApproval: approval.needsApproval
      });
      input.onActivity?.(approvalActivity);

      if (approval.needsApproval) {
        const approving = await input.store.updateTradeStatus(currentTrade.id, "approving");
        if (!approving) throw new Error(`trade_not_found:${currentTrade.id}`);
        currentTrade = approving;
        input.onTrade?.(currentTrade);
      }

      const quote = await trading.quote({
        tokenIn: DEFAULT_TOKEN_IN,
        tokenOut: DEFAULT_TOKEN_OUT,
        amountIn: DEFAULT_AMOUNT_IN,
        chainId: MONAD_TESTNET_CHAIN_ID,
        swapper: agent.eoaAddress
      });
      const quoteActivity = await input.store.addActivity(agentId, "trade.quote_received", "monad-testnet", {
        tradeId: currentTrade.id,
        approvalRequestId: approval.approvalRequestId ?? "",
        quoteRequestId: String(quote.quoteResponse.requestId ?? ""),
        amountOut: quote.amountOut
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

      const broadcastEvent = await input.store.addActivity(agentId, "trade.swap_broadcast", "monad-testnet", {
        tradeId: currentTrade.id,
        approvalRequestId: approval.approvalRequestId ?? "",
        quoteRequestId: swap.quoteRequestId ?? String(quote.quoteResponse.requestId ?? ""),
        swapRequestId: swap.swapRequestId ?? "",
        txHash: swap.txHash
      });
      input.onActivity?.(broadcastEvent);

      const confirmed = await input.store.updateTradeStatus(currentTrade.id, "confirmed", {
        executionTxHash: swap.txHash
      });
      if (!confirmed) throw new Error(`trade_not_found:${currentTrade.id}`);
      currentTrade = confirmed;
      input.onTrade?.(currentTrade);

      const confirmedEvent = await input.store.addActivity(agentId, "trade.swap_confirmed", "monad-testnet", {
        tradeId: currentTrade.id,
        approvalRequestId: approval.approvalRequestId ?? "",
        quoteRequestId: swap.quoteRequestId ?? String(quote.quoteResponse.requestId ?? ""),
        swapRequestId: swap.swapRequestId ?? "",
        txHash: swap.txHash
      });
      input.onActivity?.(confirmedEvent);

      const attested = await attestation.recordTrade({
        sourceChainId: MONAD_TESTNET_CHAIN_ID,
        sourceTxHash: swap.txHash,
        tokenIn: DEFAULT_TOKEN_IN,
        tokenOut: DEFAULT_TOKEN_OUT,
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

      return { detail: `trade:${currentTrade.id}:confirmed` };
    } catch (error) {
      const message = error instanceof Error ? error.message : "trade_execution_failed";
      const failed = await input.store.updateTradeStatus(currentTrade.id, "failed", {
        errorMessage: message
      });
      if (failed) input.onTrade?.(failed);
      const failedEvent = await input.store.addActivity(agentId, "trade.failed", "monad-testnet", {
        tradeId: currentTrade.id,
        message
      });
      input.onActivity?.(failedEvent);
      throw error;
    }
  };
}
