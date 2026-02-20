import type { FastifyInstance } from "fastify";
import { fail, ok } from "../http/envelope.js";
import type { RuntimeStoreContract } from "../state/runtime-store.js";

export async function registerPaymentRoutes(app: FastifyInstance, store: RuntimeStoreContract): Promise<void> {
  app.get("/api/payments", async (request) => {
    return ok(request, { payments: await store.listPayments() });
  });

  app.get("/api/payments/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const payment = await store.getPayment(id);
    if (!payment) {
      fail(request, reply, 404, "NOT_FOUND", "Payment not found", { paymentId: id });
      return;
    }
    return ok(request, { payment });
  });
}
