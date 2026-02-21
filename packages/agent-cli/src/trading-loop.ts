import type { Config, TradingLoopOptions, TickResult, TradeResult, TradeSignal } from "./types.js";
import { loadWallet } from "./wallet.js";
import { createApiClient } from "./api-client.js";
import { createMcpClient, KITE_MCP_SETUP_INSTRUCTIONS } from "./kite-mcp.js";
import logger from "./logger.js";

interface PriceSnapshot {
  price: number;
  timestamp: Date;
}

class MomentumStrategy {
  private priceHistory: PriceSnapshot[] = [];
  private readonly maxHistory = 10;

  addPrice(price: number): void {
    this.priceHistory.push({ price, timestamp: new Date() });
    if (this.priceHistory.length > this.maxHistory) {
      this.priceHistory.shift();
    }
  }

  evaluate(): TradeSignal {
    if (this.priceHistory.length < 3) {
      return { action: "hold", reason: "not enough price data" };
    }

    const prices = this.priceHistory.map((p) => p.price);
    const [a, b, c] = prices.slice(-3);

    if (a < b && b < c) {
      return { action: "buy", reason: "three consecutive upward candles" };
    }

    if (a > b && b > c) {
      return { action: "sell", reason: "three consecutive downward candles" };
    }

    return { action: "hold", reason: "no clear momentum" };
  }

  getHistory(): PriceSnapshot[] {
    return [...this.priceHistory];
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runTradingLoop(
  config: Config,
  options: TradingLoopOptions = {}
): Promise<void> {
  const {
    dryRun = false,
    tickIntervalMs = config.tickIntervalMs,
    amount = config.defaultAmount,
    onTick,
    onTrade,
    onError
  } = options;

  const wallet = loadWallet();
  if (!wallet) {
    throw new Error("No wallet found. Run `synoptic-agent init` first.");
  }

  const mcpClient = createMcpClient();
  if (!mcpClient) {
    throw new Error(`Kite MCP not configured.\n${KITE_MCP_SETUP_INSTRUCTIONS}`);
  }

  const apiClient = createApiClient(config, mcpClient);
  const strategy = new MomentumStrategy();

  logger.info("Starting trading loop", {
    wallet: wallet.address,
    amount,
    tickInterval: tickIntervalMs,
    dryRun
  });

  const modeLabel = dryRun ? "[DRY-RUN]" : "[LIVE]";
  console.log(`\n${modeLabel} Trading loop started`);
  console.log(`  Wallet: ${wallet.address}`);
  console.log(`  Amount: ${amount}`);
  console.log(`  Tick:   ${tickIntervalMs}ms`);
  console.log(`  API:    ${config.apiUrl}`);
  console.log(`\n  Press Ctrl+C to stop\n`);

  let tickCount = 0;

  while (true) {
    tickCount++;
    const tickStart = new Date();

    try {
      const priceResult = await apiClient.getPrice("ETH/USDT");
      const price = priceResult.price;
      strategy.addPrice(price);

      const signal = strategy.evaluate();

      const tickResult: TickResult = {
        timestamp: tickStart,
        price,
        signal,
        actionTaken: false
      };

      const history = strategy.getHistory();
      const lastPrices = history
        .slice(-5)
        .map((p) => p.price.toFixed(2))
        .join(" > ");

      console.log(`[tick ${tickCount}] ${tickStart.toISOString()}`);
      console.log(`  Price: $${price.toFixed(2)} | History: ${lastPrices}`);
      console.log(`  Signal: ${signal.action.toUpperCase()} (${signal.reason})`);

      if (signal.action !== "hold" && !dryRun) {
        console.log(`  Executing ${signal.action}...`);

        try {
          const quoteResult = await apiClient.getQuote({
            walletAddress: wallet.address,
            amountIn: amount
          });

          const tradeResult = await apiClient.executeSwap({
            quoteResponse: quoteResult.quote,
            amountIn: amount
          });

          const trade: TradeResult = {
            timestamp: new Date(),
            type: signal.action as "buy" | "sell",
            amountIn: amount,
            amountOut: quoteResult.amountOut,
            txHash: tradeResult.txHash,
            attestationTxHash: tradeResult.attestationTxHash,
            status: "confirmed"
          };

          tickResult.actionTaken = true;

          console.log(`  ✓ Trade executed: ${tradeResult.txHash}`);
          if (tradeResult.attestationTxHash) {
            console.log(`  ✓ Attestation: ${tradeResult.attestationTxHash}`);
          }

          logger.info("Trade executed", { trade });
          onTrade?.(trade);
        } catch (tradeError) {
          const errorMsg = tradeError instanceof Error ? tradeError.message : String(tradeError);
          console.log(`  ✗ Trade failed: ${errorMsg}`);
          logger.error("Trade failed", { error: errorMsg });
          onError?.(tradeError instanceof Error ? tradeError : new Error(errorMsg));
        }
      } else if (signal.action !== "hold" && dryRun) {
        console.log(`  [DRY-RUN] Would execute ${signal.action}`);
        tickResult.actionTaken = true;
      }

      onTick?.(tickResult);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`  ✗ Tick failed: ${errorMsg}`);
      logger.error("Tick failed", { error: errorMsg });
      onError?.(error instanceof Error ? error : new Error(errorMsg));
    }

    console.log("");

    await sleep(tickIntervalMs);
  }
}

export { MomentumStrategy };
