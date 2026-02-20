import type { FastifyInstance } from "fastify";
import { ok } from "../http/envelope.js";
import type { RuntimeStoreContract } from "../state/runtime-store.js";

export async function registerActivityRoutes(app: FastifyInstance, store: RuntimeStoreContract): Promise<void> {
  app.get("/api/activity", async (request) => {
    const query = (request.query as { agentId?: string }) ?? {};
    return ok(request, { events: await store.listActivity(query.agentId) });
  });
}
