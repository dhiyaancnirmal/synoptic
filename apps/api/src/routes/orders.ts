import type { Express, Request, Response } from "express";
import type { OrderRecord } from "@synoptic/types/orders";
import type { GetOrderResponse } from "@synoptic/types/rest";
import type { ApiContext } from "../context.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError, sendApiError } from "../utils/errors.js";

function mapOrder(order: {
  orderId: string;
  agentId: string;
  status: "PENDING" | "EXECUTED" | "REJECTED";
  venueType: "SPOT" | "PERP" | "PREDICTION";
  marketId: string;
  side: "BUY" | "SELL";
  size: string;
  limitPrice: string | null;
  rejectionReason: OrderRecord["rejectionReason"] | null;
  paymentSettlementId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): OrderRecord {
  return {
    orderId: order.orderId,
    agentId: order.agentId,
    status: order.status,
    venueType: order.venueType,
    marketId: order.marketId,
    side: order.side,
    size: order.size,
    limitPrice: order.limitPrice ?? undefined,
    rejectionReason: order.rejectionReason ?? undefined,
    paymentSettlementId: order.paymentSettlementId ?? undefined,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString()
  };
}

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
