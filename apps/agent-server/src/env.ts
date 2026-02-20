export interface AgentServerEnv {
  port: number;
  dashboardUrl: string;
  agentTickIntervalMs: number;
  agentMaxConsecutiveErrors: number;
  authTokenSecret: string;
  authChallengeTtlMs: number;
  authSessionTtlSeconds: number;
  budgetResetTimeZone: string;
  kiteFacilitatorUrl: string;
  kiteNetwork: string;
  kiteTestUsdtAddress: string;
  kiteServicePayTo: string;
  agentPrivateKey: string;
  executionChainId: number;
  executionRpcUrl: string;
  executionExplorerUrl: string;
  executionChainName: string;
  kiteRpcUrl: string;
  uniswapApiKey: string;
  registryAddress: string;
  quicknodeSecurityToken: string;
  monadUsdcAddress: string;
  monadUsdtAddress: string;
}

function readNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadEnv(): AgentServerEnv {
  const executionRpcUrl =
    process.env.EXECUTION_RPC_URL ??
    process.env.EXECUTION_CHAIN_RPC_URL ??
    process.env.MONAD_RPC_URL ??
    "";
  const executionChainId = readNumber(
    process.env.EXECUTION_CHAIN_ID ?? process.env.MONAD_CHAIN_ID,
    10143
  );

  return {
    port: readNumber(process.env.PORT, 3001),
    dashboardUrl: process.env.DASHBOARD_URL ?? "http://localhost:3000",
    agentTickIntervalMs: readNumber(process.env.AGENT_TICK_INTERVAL_MS, 30_000),
    agentMaxConsecutiveErrors: readNumber(process.env.AGENT_MAX_CONSECUTIVE_ERRORS, 3),
    authTokenSecret:
      process.env.AUTH_TOKEN_SECRET ??
      process.env.SYNOPTIC_AGENT_SERVER_TOKEN ??
      process.env.AGENT_PRIVATE_KEY ??
      "synoptic-prod-secret",
    authChallengeTtlMs: readNumber(process.env.AUTH_CHALLENGE_TTL_MS, 5 * 60_000),
    authSessionTtlSeconds: readNumber(process.env.AUTH_SESSION_TTL_SECONDS, 60 * 60),
    budgetResetTimeZone: process.env.BUDGET_RESET_TIMEZONE ?? "UTC",
    kiteFacilitatorUrl: process.env.KITE_FACILITATOR_URL ?? "https://facilitator.pieverse.io",
    kiteNetwork: process.env.KITE_NETWORK ?? "kite-testnet",
    kiteTestUsdtAddress:
      process.env.KITE_TEST_USDT_ADDRESS ?? "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63",
    kiteServicePayTo:
      process.env.KITE_SERVICE_PAYTO ??
      process.env.KITE_FACILITATOR_ADDRESS ??
      "0x12343e649e6b2b2b77649DFAb88f103c02F3C78b",
    agentPrivateKey: process.env.AGENT_PRIVATE_KEY ?? "",
    executionChainId,
    executionRpcUrl,
    executionExplorerUrl:
      process.env.EXECUTION_EXPLORER_URL ??
      process.env.NEXT_PUBLIC_EXECUTION_EXPLORER_URL ??
      process.env.NEXT_PUBLIC_MONAD_EXPLORER_URL ??
      "https://testnet.monadexplorer.com",
    executionChainName:
      process.env.EXECUTION_CHAIN_NAME ?? process.env.EXECUTION_NETWORK ?? "monad-testnet",
    kiteRpcUrl: process.env.KITE_RPC_URL ?? process.env.KITE_TESTNET_RPC ?? "",
    uniswapApiKey: process.env.UNISWAP_API_KEY ?? "",
    registryAddress:
      process.env.SERVICE_REGISTRY_ADDRESS ?? process.env.TRADE_REGISTRY_ADDRESS ?? "",
    quicknodeSecurityToken:
      process.env.QUICKNODE_SECURITY_TOKEN ??
      process.env.QUICKNODE_STREAM_SECURITY_TOKEN ??
      process.env.QUICKNODE_STREAM_TOKEN ??
      "",
    monadUsdcAddress:
      process.env.MONAD_USDC_ADDRESS ?? "0x62534e4bbd6d9ebac0ac99aeaa0aa48e56372df0",
    monadUsdtAddress: process.env.MONAD_USDT_ADDRESS ?? ""
  };
}
