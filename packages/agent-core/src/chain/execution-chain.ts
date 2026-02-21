export const MONAD_CHAIN_ID = 143;
export const MONAD_TESTNET_CHAIN_ID = 10143;

export const NATIVE_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000";

export const WMON_MONAD = "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A";
export const WMON_MONAD_TESTNET = "0x760afe86e5de5fa0ee542fc7b7b713e1c5425701";

export const USDC_MONAD = "0x62534e4bbd6d9ebac0ac99aeaa0aa48e56372df0";
export const USDC_MONAD_TESTNET = "0x62534e4bbd6d9ebac0ac99aeaa0aa48e56372df0";

export const MONAD_SWAP_ROUTER02 = "0xfe31f71c1b106eac32f1a19239c9a9a72ddfb900";
export const MONAD_UNIVERSAL_ROUTER = "0x0d97dc33264bfc1c226207428a79b26757fb9dc3";
export const MONAD_PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

export const MONAD_TESTNET_SWAP_ROUTER02 = "0x3ae6d8a282d67893e17aa70ebffb33ee5aa65893";
export const MONAD_TESTNET_UNIVERSAL_ROUTER = "0x3ae6d8a282d67893e17aa70ebffb33ee5aa65893";
export const MONAD_TESTNET_PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

export interface ExecutionChainProfile {
  chainId: number;
  name: "monad" | "monad-testnet" | (string & {});
  explorerUrl: string;
  wrappedNativeToken: string;
  stableToken: string;
  permit2Address: string;
  swapRouter02Address: string;
  universalRouterAddress: string;
  supportsLiveTradingApi: boolean;
  defaultTradePair: {
    tokenIn: string;
    tokenOut: string;
    intent: "swap" | "order";
  };
}

const MONAD_MAINNET_PROFILE: ExecutionChainProfile = {
  chainId: MONAD_CHAIN_ID,
  name: "monad",
  explorerUrl: "https://monadexplorer.com",
  wrappedNativeToken: WMON_MONAD,
  stableToken: USDC_MONAD,
  permit2Address: MONAD_PERMIT2,
  swapRouter02Address: MONAD_SWAP_ROUTER02,
  universalRouterAddress: MONAD_UNIVERSAL_ROUTER,
  supportsLiveTradingApi: true,
  defaultTradePair: {
    tokenIn: NATIVE_TOKEN_ADDRESS,
    tokenOut: WMON_MONAD,
    intent: "swap"
  }
};

const MONAD_TESTNET_PROFILE: ExecutionChainProfile = {
  chainId: MONAD_TESTNET_CHAIN_ID,
  name: "monad-testnet",
  explorerUrl: "https://testnet.monadexplorer.com",
  wrappedNativeToken: WMON_MONAD_TESTNET,
  stableToken: USDC_MONAD_TESTNET,
  permit2Address: MONAD_TESTNET_PERMIT2,
  swapRouter02Address: MONAD_TESTNET_SWAP_ROUTER02,
  universalRouterAddress: MONAD_TESTNET_UNIVERSAL_ROUTER,
  supportsLiveTradingApi: false,
  defaultTradePair: {
    tokenIn: NATIVE_TOKEN_ADDRESS,
    tokenOut: WMON_MONAD_TESTNET,
    intent: "swap"
  }
};

export const EXECUTION_CHAIN_PROFILES: Record<number, ExecutionChainProfile> = {
  [MONAD_CHAIN_ID]: MONAD_MAINNET_PROFILE,
  [MONAD_TESTNET_CHAIN_ID]: MONAD_TESTNET_PROFILE
};

export const DEFAULT_EXECUTION_CHAIN_ID = MONAD_CHAIN_ID;

export function getExecutionChainProfile(chainId: number): ExecutionChainProfile {
  return EXECUTION_CHAIN_PROFILES[chainId] ?? MONAD_MAINNET_PROFILE;
}

export function inferExecutionChainName(chainId: number): ExecutionChainProfile["name"] {
  return getExecutionChainProfile(chainId).name;
}

export function inferExecutionExplorerUrl(chainId: number): string {
  return getExecutionChainProfile(chainId).explorerUrl;
}

// Backwards-compat exports used by existing code paths.
export const WMON = WMON_MONAD;
