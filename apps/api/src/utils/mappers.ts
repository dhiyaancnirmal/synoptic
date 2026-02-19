import type { OrderRecord } from "@synoptic/types/orders";

export function mapOrder(order: {
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
