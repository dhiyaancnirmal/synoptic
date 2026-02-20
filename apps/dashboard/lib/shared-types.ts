export type AgentRole = "oracle" | "strategy" | "executor";
export type AgentStatus = "idle" | "running" | "paused" | "error";
export type ActivityChain = "kite-testnet" | "monad-testnet" | (string & {});

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  status: AgentStatus;
  kitePassportId?: string;
  eoaAddress: string;
  dailyBudgetUsd: string;
  spentTodayUsd: string;
  strategy?: string;
  strategyConfig?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

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
  executionChain?: ActivityChain;
  kiteAttestationTx?: string;
  strategyReason?: string;
  createdAt: string;
  confirmedAt?: string;
}

export interface ActivityEvent {
  id: string;
  agentId: string;
  eventType: string;
  chain: ActivityChain;
  txHash?: string;
  blockNumber?: number;
  data: Record<string, unknown>;
  createdAt: string;
}

export type WsEvent =
  | { type: "agent.status"; agentId: string; status: string }
  | { type: "payment.update"; payment: Payment }
  | { type: "trade.update"; trade: Trade }
  | { type: "activity.new"; event: ActivityEvent }
  | { type: "price.update"; pair: string; price: number; time: number };
