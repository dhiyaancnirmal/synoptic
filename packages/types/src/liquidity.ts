export type LiquidityActionType = "create" | "increase" | "decrease" | "collect";
export type LiquidityPreset = "uniform" | "bell" | "bid_ask_inverse";
export type LiquidityActionStatus = "quoted" | "submitted" | "confirmed" | "failed";

export interface LiquidityQuote {
  requestId: string;
  chainId: number;
  token0: string;
  token1: string;
  feeTier: number;
  amount0: string;
  amount1: string;
  lowerBoundPct: number;
  upperBoundPct: number;
  quotePayload: Record<string, unknown>;
}

export interface LiquidityAction {
  id: string;
  agentId: string;
  actionType: LiquidityActionType;
  chainId: number;
  token0: string;
  token1: string;
  feeTier: number;
  preset: LiquidityPreset;
  lowerBoundPct: number;
  upperBoundPct: number;
  amount0: string;
  amount1: string;
  positionId?: string;
  txHash?: string;
  status: LiquidityActionStatus;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}
