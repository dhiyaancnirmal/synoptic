import type { Express, Request, Response } from "express";
import type { GetOrderResponse } from "@synoptic/types/rest";
import type { ApiContext } from "../context.js";
import { requireAuth } from "../middleware/auth.js";
import { mapOrder } from "../utils/mappers.js";
import { ApiError, sendApiError } from "../utils/errors.js";

export function registerOrdersRoutes(app: Express, context: ApiContext): void {
  const authMiddleware = requireAuth(context.config.JWT_SECRET);

  app.get("/orders/:orderId", authMiddleware, async (req: Request<{ orderId: string }>, res: Response<GetOrderResponse>) => {
    const order = await context.prisma.order.findUnique({ where: { orderId: req.params.orderId } });
    if (!order) {
      sendApiError(res, new ApiError("NOT_FOUND", 404, "Order not found"), req.requestId);
      return;
    }

    if (req.auth?.agentId !== order.agentId) {
      sendApiError(res, new ApiError("FORBIDDEN", 403, "Order does not belong to caller"), req.requestId);
      return;
    }

    res.json({ order: mapOrder(order) });
  });
}
