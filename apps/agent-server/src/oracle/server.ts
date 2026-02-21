import type { FastifyInstance } from "fastify";
import type { RuntimeStoreContract } from "../state/runtime-store.js";
import { UniswapClient, USDC_MONAD, WMON } from "@synoptic/agent-core";
import { WsHub } from "../ws/hub.js";
import { RealFacilitatorPaymentAdapter } from "./facilitator.js";
import { DemoPaymentAdapter } from "./demo-facilitator.js";
import { requireX402Payment } from "./middleware.js";

const DEFAULT_SWAPPER_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const STABLE_TOKEN_DECIMALS = 6;
const ONE_ETH_WEI = "1000000000000000000";

function readStaticEthUsdPrice(): number {
  const fromEnv = Number(process.env.ORACLE_ETH_USD_PRICE);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return 3000;
}

function parseAmountOutFromQuote(payload: Record<string, unknown>): string | null {
  const quote = payload.quote;
  if (quote && typeof quote === "object") {
    const output = (quote as Record<string, unknown>).output;
    if (output && typeof output === "object") {
      const amount = (output as Record<string, unknown>).amount;
      if (typeof amount === "string" && amount.length > 0) return amount;
    }
  }

  const classicQuote = payload.classicQuote;
  if (classicQuote && typeof classicQuote === "object") {
    const amountOut = (classicQuote as Record<string, unknown>).outputAmount;
    if (typeof amountOut === "string" && amountOut.length > 0) return amountOut;
  }

  return null;
}

function decodeStableAmount(amount: string, decimals = STABLE_TOKEN_DECIMALS): number | null {
  if (!/^\d+$/.test(amount)) return null;
  const raw = Number(amount);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const price = raw / 10 ** decimals;
  return Number.isFinite(price) && price > 0 ? price : null;
}

async function readUniswapEthUsdPrice(input: {
  uniswapApiKey: string;
  executionChainId: number;
  stableTokenAddress: string;
  swapper: string;
}): Promise<number | null> {
  if (!input.uniswapApiKey) return null;

  try {
    const client = new UniswapClient(input.uniswapApiKey);
    const quote = (await client.quote({
      tokenIn: WMON,
      tokenOut: input.stableTokenAddress,
      tokenInChainId: input.executionChainId,
      tokenOutChainId: input.executionChainId,
      type: "EXACT_INPUT",
      amount: ONE_ETH_WEI,
      swapper: input.swapper
    })) as unknown as Record<string, unknown>;

    const amountOutRaw = parseAmountOutFromQuote(quote);
    if (!amountOutRaw) return null;
    return decodeStableAmount(amountOutRaw);
  } catch {
    return null;
  }
}

export async function registerOracleRoutes(
  app: FastifyInstance,
  deps: {
    store: RuntimeStoreContract;
    wsHub: WsHub;
    budgetResetTimeZone: string;
    facilitatorUrl: string;
    facilitatorMode: "facilitator" | "demo";
    network: string;
    payToAddress: string;
    paymentAssetAddress: string;
    paymentAssetDecimals: number;
    uniswapApiKey: string;
    executionChainId: number;
    monadUsdcAddress: string;
    x402OraclePriceUsd: number;
  }
): Promise<void> {
  const paymentAdapter =
    deps.facilitatorMode === "demo"
      ? new DemoPaymentAdapter()
      : new RealFacilitatorPaymentAdapter({
          baseUrl: deps.facilitatorUrl,
          network: deps.network
        });

  app.get("/oracle/price", async (request, reply) => {
    const allowed = await requireX402Payment(request, reply, {
      store: deps.store,
      paymentAdapter,
      network: deps.network,
      payToAddress: deps.payToAddress,
      paymentAssetAddress: deps.paymentAssetAddress,
      paymentAssetDecimals: deps.paymentAssetDecimals,
      budgetResetTimeZone: deps.budgetResetTimeZone,
      enforceLocalBudget: false,
      fixedCostUsd: deps.x402OraclePriceUsd,
      onPayment(payment) {
        deps.wsHub.broadcast({ type: "payment.update", payment });
      },
      onActivity(event) {
        deps.wsHub.broadcast({ type: "activity.new", event });
      }
    });
    if (!allowed) {
      return;
    }

    const pair = ((request.query as { pair?: string }).pair ?? "ETH/USDT").toUpperCase();
    const agents = await deps.store.listAgents();
    const swapper = agents[0]?.eoaAddress ?? DEFAULT_SWAPPER_ADDRESS;
    const stableTokenAddress = deps.monadUsdcAddress || USDC_MONAD;
    const uniswapPrice = await readUniswapEthUsdPrice({
      uniswapApiKey: deps.uniswapApiKey,
      executionChainId: deps.executionChainId,
      stableTokenAddress,
      swapper
    });
    const price = uniswapPrice ?? readStaticEthUsdPrice();
    const source = uniswapPrice ? "uniswap" : "local-static";

    await deps.store.createPriceSnapshot({
      pair,
      price: price.toFixed(8),
      source,
      timestamp: new Date()
    });
    deps.wsHub.broadcast({ type: "price.update", pair, price, time: Date.now() });
    return {
      pair,
      price,
      timestamp: Date.now(),
      source
    };
  });
}
