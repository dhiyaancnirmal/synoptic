export const UNISWAP_GATEWAY_BASE_URL = "https://trade-api.gateway.uniswap.org/v1";
export const UNISWAP_DEFAULT_ROUTING_PREFERENCE = "BEST_PRICE";
export const UNISWAP_DEFAULT_PROTOCOLS = ["V2", "V3", "V4"] as const;
export const UNISWAP_UNIVERSAL_ROUTER_VERSION = "2.0";
export const UNISWAP_CONTENT_TYPE = "application/json";

export type UniswapTradeIntent = "swap" | "order";

export type UniswapRoutingType =
  | "CLASSIC"
  | "DUTCH_LIMIT"
  | "DUTCH_V2"
  | "LIMIT_ORDER"
  | "WRAP"
  | "UNWRAP"
  | "BRIDGE"
  | "PRIORITY"
  | "DUTCH_V3"
  | "QUICKROUTE"
  | "CHAINED";

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
  tokenInChainId: number;
  tokenOutChainId: number;
  type: "EXACT_INPUT" | "EXACT_OUTPUT";
  amount: string;
  swapper: string;
  routingPreference?: string;
  protocols?: string[];
  slippageTolerance?: number;
  routingType?: UniswapRoutingType;
  urgency?: "normal" | "fast";
  autoSlippage?: boolean;
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

export interface UniswapSupportedChain {
  chainId: number;
  name?: string;
  supportsSwaps: boolean;
  supportsLp: boolean;
}

export interface UniswapSupportedChainsResponse {
  chains: UniswapSupportedChain[];
}

export interface UniswapLpRequest {
  [key: string]: unknown;
}

export interface UniswapLpResponse {
  requestId?: string;
  tx?: UniswapUnsignedTransaction;
  swap?: UniswapUnsignedTransaction;
  [key: string]: unknown;
}
