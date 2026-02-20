export interface TradeAttestationInput {
  sourceTxHash: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  strategyReason: string;
}

export async function attestTrade(input: TradeAttestationInput): Promise<string> {
  void input;
  return "0xattestation";
}
