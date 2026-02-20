export type TradeStatus =
  | "quoting"
  | "approving"
  | "signing"
  | "broadcast"
  | "confirmed"
  | "reverted"
  | "failed";

export interface Trade {
  id: string;
  agentId: string;
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  routingType: string;
  status: TradeStatus;
  executionTxHash?: string;
  kiteAttestationTx?: string;
  strategyReason?: string;
  createdAt: string;
  confirmedAt?: string;
}
