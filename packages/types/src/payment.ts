export type PaymentDirection = "outgoing" | "incoming";
export type PaymentStatus = "requested" | "authorized" | "settled" | "failed";

export interface Payment {
  id: string;
  agentId: string;
  direction: PaymentDirection;
  amountWei: string;
  amountUsd: string;
  tokenAddress: string;
  serviceUrl: string;
  status: PaymentStatus;
  kiteTxHash?: string;
  facilitatorResponse?: Record<string, unknown>;
  x402Challenge?: Record<string, unknown>;
  createdAt: string;
  settledAt?: string;
}
