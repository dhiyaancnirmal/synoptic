import type { FastifyInstance } from "fastify";
import type { RuntimeStoreContract } from "../state/runtime-store.js";
import { WsHub } from "../ws/hub.js";
import { RealFacilitatorPaymentAdapter } from "./facilitator.js";
import { DemoPaymentAdapter } from "./demo-facilitator.js";
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

export async function registerOracleRoutes(
  app: FastifyInstance,
  deps: {
    store: RuntimeStoreContract;
    wsHub: WsHub;
    budgetResetTimeZone: string;
    facilitatorUrl: string;
    facilitatorMode: "real" | "demo";
    network: string;
    payToAddress: string;
    paymentAssetAddress: string;
    paymentAssetDecimals: number;
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
    const price = await fetchEthUsdPrice();
    await deps.store.createPriceSnapshot({
      pair,
      price: price.toFixed(8),
      source: "coingecko",
      timestamp: new Date()
    });
    deps.wsHub.broadcast({ type: "price.update", pair, price, time: Date.now() });
    return {
      pair,
      price,
      timestamp: Date.now(),
      source: "coingecko"
    };
  });
}
