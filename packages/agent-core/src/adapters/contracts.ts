export interface PaymentAdapter {
  verify(paymentToken: string): Promise<{ authorized: boolean; reason?: string }>;
  settle(paymentToken: string): Promise<{ settled: boolean; txHash?: string; reason?: string }>;
}

export interface UnsignedTransaction {
  to: string;
  from?: string;
  data: string;
  value?: string;
  chainId?: number;
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface TradingAdapter {
  checkApproval(input: {
    walletAddress: string;
    token: string;
    amount: string;
    chainId: number;
  }): Promise<{ needsApproval: boolean; approvalTx?: UnsignedTransaction; approvalRequestId?: string }>;
  quote(input: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    chainId: number;
    swapper: string;
    intent?: "swap" | "order";
    routingType?: string;
    slippageTolerance?: number;
    urgency?: "normal" | "fast";
    autoSlippage?: boolean;
  }): Promise<{ quoteResponse: Record<string, unknown>; amountOut: string }>;
  executeSwap(input: {
    quoteResponse: Record<string, unknown>;
    signature?: string;
  }): Promise<{ txHash: string; status: "broadcast" | "confirmed"; quoteRequestId?: string; swapRequestId?: string }>;
}

export interface AttestationAdapter {
  recordService?(input: {
    serviceType: string;
    sourceChainId: number;
    sourceTxHashOrRef: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOut: string;
    metadata: string;
  }): Promise<{ attestationTxHash: string }>;
  recordTrade(input: {
    sourceChainId: number;
    sourceTxHash: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOut: string;
    strategyReason: string;
  }): Promise<{ attestationTxHash: string }>;
}

export interface IdentityAdapter {
  passport(input: { owner: string }): Promise<{ passportId: string }>;
  session(input: { passportId: string; delegate: string }): Promise<{ sessionKey: string }>;
}
