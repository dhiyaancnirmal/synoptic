export type OrderStatus = "PENDING" | "EXECUTED" | "REJECTED";

export interface OrderRecord {
  orderId: string;
  agentId: string;
  status: OrderStatus;
  venueType: "SPOT" | "PERP" | "PREDICTION";
}
