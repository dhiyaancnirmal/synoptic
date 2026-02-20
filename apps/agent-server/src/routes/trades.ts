import type { FastifyInstance } from "fastify";
import { fail, ok } from "../http/envelope.js";
import type { RuntimeStoreContract } from "../state/runtime-store.js";

export async function registerTradeRoutes(app: FastifyInstance, store: RuntimeStoreContract): Promise<void> {
  app.get("/api/trades", async (request) => {
    return ok(request, { trades: await store.listTrades() });
  });

  app.get("/api/trades/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const trade = await store.getTrade(id);
    if (!trade) {
      fail(request, reply, 404, "NOT_FOUND", "Trade not found", { tradeId: id });
      return;
    }
    return ok(request, { trade });
  });
}
