import {
  DEFAULT_EXECUTION_CHAIN_ID,
  inferExecutionChainName,
  inferExecutionExplorerUrl
} from "@synoptic/agent-core";

export type SwapExecutionMode = "auto" | "live" | "simulated";

export interface AgentServerEnv {
  port: number;
  dashboardUrl: string;
  allowInsecureDevAuthBypass: boolean;
  agentTickIntervalMs: number;
  agentMaxConsecutiveErrors: number;
  authTokenSecret: string;
  authChallengeTtlMs: number;
  authSessionTtlSeconds: number;
  authRefreshTtlSeconds: number;
  budgetResetTimeZone: string;
  kiteFacilitatorUrl: string;
  kitePaymentMode: "facilitator" | "demo";
  kiteNetwork: string;
  kiteTestUsdtAddress: string;
  kitePaymentAssetDecimals: number;
  kiteServicePayTo: string;
  allowServerSigning: boolean;
  swapExecutionMode: SwapExecutionMode;
  simulatedChainIds: number[];
  simulateOnchain: boolean;
  agentPrivateKey: string;
  executionChainId: number;
  executionRpcUrl: string;
  executionExplorerUrl: string;
  executionChainName: string;
  kiteRpcUrl: string;
  uniswapApiKey: string;
  uniswapApiUrl: string;
  registryAddress: string;
  quicknodeSecurityToken: string;
  monadUsdcAddress: string;
  monadUsdtAddress: string;
  x402OraclePriceUsd: number;
  x402TradeQuoteUsd: number;
  x402TradeExecuteUsd: number;
  x402LiquidityActionUsd: number;
}

function readNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function readSwapExecutionMode(
  explicitMode: string | undefined,
  simulateOnchainCompat: boolean
): SwapExecutionMode {
  if (simulateOnchainCompat) return "simulated";
  const normalized = explicitMode?.trim().toLowerCase();
  if (!normalized) return "auto";
  if (normalized === "auto" || normalized === "live" || normalized === "simulated") return normalized;
  throw new Error(
    `Invalid SWAP_EXECUTION_MODE '${explicitMode}'. Expected 'auto', 'live', or 'simulated'.`
  );
}

function readChainIdList(value: string | undefined, fallback: number[]): number[] {
  if (!value || value.trim().length === 0) return fallback;
  const parsed = value
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry) && entry > 0);
  return parsed.length > 0 ? Array.from(new Set(parsed)) : fallback;
}

function readPaymentMode(
  explicitMode: string | undefined,
  deprecatedMode: string | undefined
): "facilitator" | "demo" {
  if (explicitMode) {
    const normalized = explicitMode.trim().toLowerCase();
    if (normalized === "facilitator" || normalized === "demo") return normalized;
    throw new Error(
      `Invalid KITE_PAYMENT_MODE '${explicitMode}'. Expected 'facilitator' or 'demo'.`
    );
  }

  if (deprecatedMode) {
    const normalized = deprecatedMode.trim().toLowerCase();
    if (normalized === "real") {
      console.warn(
        "[env] FACILITATOR_MODE=real is deprecated. Use KITE_PAYMENT_MODE=facilitator."
      );
      return "facilitator";
    }
    if (normalized === "demo") {
      console.warn("[env] FACILITATOR_MODE is deprecated. Use KITE_PAYMENT_MODE=demo.");
      return "demo";
    }
  }

  return "facilitator";
}

export function loadEnv(): AgentServerEnv {
  const executionRpcUrl =
    process.env.EXECUTION_RPC_URL ??
    process.env.EXECUTION_CHAIN_RPC_URL ??
    process.env.MONAD_RPC_URL ??
    "";
  const executionChainId = readNumber(
    process.env.EXECUTION_CHAIN_ID ?? process.env.MONAD_CHAIN_ID,
    DEFAULT_EXECUTION_CHAIN_ID
  );
  const simulateOnchainCompat = readBoolean(
    process.env.SIMULATE_ONCHAIN ?? process.env.SYNOPTIC_SIMULATE_ONCHAIN,
    false
  );
  const swapExecutionMode = readSwapExecutionMode(
    process.env.SWAP_EXECUTION_MODE ?? process.env.SYNOPTIC_SWAP_EXECUTION_MODE,
    simulateOnchainCompat
  );
  const simulatedChainIds = readChainIdList(
    process.env.SIMULATED_CHAIN_IDS ?? process.env.SYNOPTIC_SIMULATED_CHAIN_IDS,
    [10143]
  );

  return {
    port: readNumber(process.env.PORT, 3001),
    dashboardUrl: process.env.DASHBOARD_URL ?? "http://localhost:3000",
    allowInsecureDevAuthBypass: readBoolean(
      process.env.ALLOW_INSECURE_DEV_AUTH_BYPASS ??
      process.env.SYNOPTIC_ALLOW_INSECURE_DEV_AUTH_BYPASS,
      false
    ),
    agentTickIntervalMs: readNumber(process.env.AGENT_TICK_INTERVAL_MS, 30_000),
    agentMaxConsecutiveErrors: readNumber(process.env.AGENT_MAX_CONSECUTIVE_ERRORS, 3),
    authTokenSecret:
      process.env.AUTH_TOKEN_SECRET ??
      process.env.SYNOPTIC_AGENT_SERVER_TOKEN ??
      process.env.AGENT_PRIVATE_KEY ??
      "synoptic-prod-secret",
    authChallengeTtlMs: readNumber(process.env.AUTH_CHALLENGE_TTL_MS, 5 * 60_000),
    authSessionTtlSeconds: readNumber(process.env.AUTH_SESSION_TTL_SECONDS, 15 * 60),
    authRefreshTtlSeconds: readNumber(process.env.AUTH_REFRESH_TTL_SECONDS, 7 * 24 * 60 * 60),
    budgetResetTimeZone: process.env.BUDGET_RESET_TIMEZONE ?? "UTC",
    kiteFacilitatorUrl: process.env.KITE_FACILITATOR_URL ?? "https://facilitator.pieverse.io",
    kitePaymentMode: readPaymentMode(
      process.env.KITE_PAYMENT_MODE,
      process.env.FACILITATOR_MODE
    ),
    kiteNetwork: process.env.KITE_NETWORK ?? "kite-testnet",
    kiteTestUsdtAddress:
      process.env.KITE_TEST_USDT_ADDRESS ?? "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63",
    kitePaymentAssetDecimals: readNumber(
      process.env.KITE_PAYMENT_ASSET_DECIMALS ?? process.env.KITE_TEST_USDT_DECIMALS,
      18
    ),
    kiteServicePayTo:
      process.env.KITE_SERVICE_PAYTO ??
      process.env.KITE_FACILITATOR_ADDRESS ??
      "0x66ad7ef70cc88e37fa692d85c8a55ed4c1493251",
    allowServerSigning: readBoolean(process.env.ALLOW_SERVER_SIGNING, false),
    swapExecutionMode,
    simulatedChainIds,
    simulateOnchain: simulateOnchainCompat,
    agentPrivateKey: process.env.AGENT_PRIVATE_KEY ?? "",
    executionChainId,
    executionRpcUrl,
    executionExplorerUrl:
      process.env.EXECUTION_EXPLORER_URL ??
      process.env.NEXT_PUBLIC_EXECUTION_EXPLORER_URL ??
      process.env.NEXT_PUBLIC_MONAD_EXPLORER_URL ??
      inferExecutionExplorerUrl(executionChainId),
    executionChainName:
      process.env.EXECUTION_CHAIN_NAME ??
      process.env.EXECUTION_NETWORK ??
      inferExecutionChainName(executionChainId),
    kiteRpcUrl: process.env.KITE_RPC_URL ?? process.env.KITE_TESTNET_RPC ?? "",
    uniswapApiKey: process.env.UNISWAP_API_KEY ?? "",
    uniswapApiUrl: process.env.UNISWAP_API_URL ?? "",
    registryAddress:
      process.env.SERVICE_REGISTRY_ADDRESS ?? process.env.TRADE_REGISTRY_ADDRESS ?? "",
    quicknodeSecurityToken:
      process.env.QUICKNODE_SECURITY_TOKEN ??
      process.env.QUICKNODE_STREAM_SECURITY_TOKEN ??
      process.env.QUICKNODE_STREAM_TOKEN ??
      "",
    monadUsdcAddress:
      process.env.MONAD_USDC_ADDRESS ?? "0x62534e4bbd6d9ebac0ac99aeaa0aa48e56372df0",
    monadUsdtAddress: process.env.MONAD_USDT_ADDRESS ?? "",
    x402OraclePriceUsd: readNumber(process.env.X402_ORACLE_PRICE_USD, 0.25),
    x402TradeQuoteUsd: readNumber(process.env.X402_TRADE_QUOTE_USD, 0.25),
    x402TradeExecuteUsd: readNumber(process.env.X402_TRADE_EXECUTE_USD, 0.35),
    x402LiquidityActionUsd: readNumber(process.env.X402_LIQUIDITY_ACTION_USD, 0.3)
  };
}
