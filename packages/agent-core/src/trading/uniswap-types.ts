export const UNISWAP_GATEWAY_BASE_URL = "https://trade-api.gateway.uniswap.org/v1";
export const UNISWAP_DEFAULT_ROUTING_PREFERENCE = "BEST_PRICE";
export const UNISWAP_DEFAULT_PROTOCOLS = ["V2", "V3", "V4"] as const;
export const UNISWAP_UNIVERSAL_ROUTER_VERSION = "2.0";
export const UNISWAP_CONTENT_TYPE = "application/json";

export interface UniswapCheckApprovalRequest {
  walletAddress: string;
  token: string;
  amount: string;
  chainId: number;
}

export interface UniswapUnsignedTransaction {
  to: string;
  data: string;
  value?: string;
  from?: string;
  chainId?: number;
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface UniswapCheckApprovalResponse {
  requestId: string;
  approval?: UniswapUnsignedTransaction;
  gasFee?: string;
}

export interface UniswapQuoteRequest {
  tokenIn: string;
  tokenOut: string;
  tokenInChainId: string;
  tokenOutChainId: string;
  type: "EXACT_INPUT" | "EXACT_OUTPUT";
  amount: string;
  swapper: string;
  routingPreference?: string;
  protocols?: string[];
  slippageTolerance?: number;
}

export interface UniswapQuoteResponse {
  requestId: string;
  routing?: string;
  quoteId?: string;
  permitData?: Record<string, unknown>;
  classicQuote?: Record<string, unknown>;
  quote?: Record<string, unknown>;
}

export interface UniswapSwapRequest {
  [key: string]: unknown;
  signature?: string;
  permitData?: Record<string, unknown>;
  simulateTransaction?: boolean;
  refreshGasPrice?: boolean;
}

export interface UniswapSwapResponse {
  requestId: string;
  swap: UniswapUnsignedTransaction;
  gasFee?: string;
  txFailureReasons?: string[];
}
