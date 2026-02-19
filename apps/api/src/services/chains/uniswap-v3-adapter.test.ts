import assert from "node:assert/strict";
import { test } from "node:test";
import { createUniswapV3Adapter } from "./uniswap-v3-adapter.js";
import type { ApiConfig } from "../../config.js";

const config: ApiConfig = {
  NODE_ENV: "test",
  PORT: 3001,
  AUTH_MODE: "dev",
  CORS_ORIGIN: "http://localhost:3000",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/synoptic",
  KITE_RPC_URL: "https://rpc-testnet.gokite.ai/",
  KITE_CHAIN_ID: 2368,
  TRADING_MODE: "bridge_to_base_v1",
  BASE_SEPOLIA_RPC_URL: "https://sepolia.base.org",
  BASE_SEPOLIA_CHAIN_ID: 84532,
  BASE_UNISWAP_V3_FACTORY: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
  BASE_UNISWAP_V3_ROUTER: "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4",
  BASE_UNISWAP_QUOTER_V2: "0xC5290058841028F1614F3A6F0F5816cAd0df5E27",
  KITE_BRIDGE_ROUTER: "0x7777777777777777777777777777777777777777",
  KITE_TOKEN_ON_BASE: "0xFB9a6AF5C014c32414b4a6e208a89904c6dAe266",
  BUSDT_TOKEN_ON_BASE: "0xdAD5b9eB32831D54b7f2D8c92ef4E2A68008989C",
  KITE_TESTNET_USDT: "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63",
  SERVER_SIGNER_PRIVATE_KEY: "0x1111111111111111111111111111111111111111111111111111111111111111",
  BRIDGE_TIMEOUT_MS: 1_200_000,
  MAX_TRADE_NOTIONAL_BUSDT: 10,
  SLIPPAGE_BPS: 100,
  SWAP_DEADLINE_SECONDS: 300,
  SETTLEMENT_TOKEN_ADDRESS: "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63",
  JWT_SECRET: "test-secret-123456",
  SHOPIFY_API_KEY: undefined,
  SHOPIFY_CLIENT_ID: undefined,
  SHOPIFY_CLIENT_SECRET: undefined,
  SHOPIFY_TIMEOUT_MS: 5000,
  PAYMENT_MODE: "mock",
  FACILITATOR_URL: "mock://facilitator",
  FACILITATOR_TIMEOUT_MS: 3000,
  FACILITATOR_VERIFY_PATH: "/verify",
  FACILITATOR_SETTLE_PATH: "/settle",
  PAYMENT_RETRY_ATTEMPTS: 3,
  X402_PAY_TO: "synoptic-facilitator",
  X402_PRICE_USD: "0.10",
  PRICE_SOURCE: "deterministic",
  SYNOPTIC_REGISTRY_ADDRESS: undefined,
  SYNOPTIC_MARKETPLACE_ADDRESS: undefined
};

test("mock uniswap adapter quotes and executes deterministically", async () => {
  const adapter = createUniswapV3Adapter(config);
  const quote = await adapter.quoteExactInputSingle({
    tokenIn: config.BUSDT_TOKEN_ON_BASE as `0x${string}`,
    tokenOut: config.KITE_TOKEN_ON_BASE as `0x${string}`,
    amountIn: 1_000_000_000_000_000_000n,
    fee: 3000
  });

  assert.equal(quote.poolAddress, "0x1111111111111111111111111111111111111111");
  assert.equal(quote.amountOut > 0n, true);

  const swap = await adapter.executeExactInputSingle({
    tokenIn: config.BUSDT_TOKEN_ON_BASE as `0x${string}`,
    tokenOut: config.KITE_TOKEN_ON_BASE as `0x${string}`,
    amountIn: 1_000_000_000_000_000_000n,
    fee: 3000,
    slippageBps: 100,
    deadlineSeconds: 300,
    recipient: "0x9999999999999999999999999999999999999999"
  });

  assert.equal(swap.txHash.length, 66);
  assert.equal(swap.amountOut > 0n, true);
});
