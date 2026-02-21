import type { FastifyInstance } from "fastify";
import type { PaymentAdapter } from "@synoptic/agent-core";
import type { RuntimeStoreContract } from "../state/runtime-store.js";
import { WsHub } from "../ws/hub.js";
import { requireX402Payment } from "./middleware.js";

async function fetchEthUsdPrice(fetcher: typeof fetch = fetch): Promise<number> {
  const response = await fetcher("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd", {
    headers: { accept: "application/json" }
  });
  if (!response.ok) {
    throw new Error(`coingecko_http_${response.status}`);
  }

  const payload = (await response.json()) as { ethereum?: { usd?: number } };
  const price = payload.ethereum?.usd;
  if (!Number.isFinite(price) || typeof price !== "number" || price <= 0) {
    throw new Error("coingecko_invalid_price");
  }
  return price;
}

function readStaticEthUsdPrice(): number {
  const fromEnv = Number(process.env.ORACLE_ETH_USD_PRICE);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return 3000;
}

export async function registerOracleRoutes(
  app: FastifyInstance,
  deps: {
    store: RuntimeStoreContract;
    wsHub: WsHub;
    budgetResetTimeZone: string;
    paymentAdapter: PaymentAdapter;
    network: string;
    payToAddress: string;
    paymentAssetAddress: string;
    paymentAssetDecimals: number;
  }
): Promise<void> {
  app.get("/oracle/price", async (request, reply) => {
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
    if (!allowed) {
      return;
    }

    const pair = ((request.query as { pair?: string }).pair ?? "ETH/USDT").toUpperCase();
    let source = "coingecko";
    let price = 0;
    try {
      price = await fetchEthUsdPrice();
    } catch {
      price = readStaticEthUsdPrice();
      source = "local-static";
    }
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
