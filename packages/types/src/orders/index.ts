export type OrderStatus = "PENDING" | "EXECUTED" | "REJECTED";
export type VenueType = "SPOT" | "PERP" | "PREDICTION";
export type OrderSide = "BUY" | "SELL";

export type OrderRejectionReason =
  | "INSUFFICIENT_FUNDS"
  | "INVALID_PAYMENT"
  | "FACILITATOR_UNAVAILABLE"
  | "RISK_LIMIT"
  | "INVALID_REQUEST"
  | "LIQUIDITY_UNAVAILABLE"
  | "BRIDGE_FAILED"
  | "BRIDGE_TIMEOUT"
  | "SWAP_REVERTED"
  | "UNSUPPORTED_MARKET";

export interface OrderRecord {
  orderId: string;
  agentId: string;
  status: OrderStatus;
  venueType: VenueType;
  marketId: string;
  side: OrderSide;
  size: string;
  limitPrice?: string;
  rejectionReason?: OrderRejectionReason;
  paymentSettlementId?: string;
  createdAt: string;
  updatedAt: string;
}
