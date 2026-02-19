import assert from "node:assert/strict";
import { test } from "node:test";
import { parseUnits, type Address } from "viem";
import type { ApiContext } from "../context.js";
import type { ApiConfig } from "../config.js";
import { createExecutionOrchestrator } from "./execution-orchestrator.js";
import type { BridgeAdapter } from "./chains/bridge-adapter.js";
import type { UniswapV3Adapter } from "./chains/uniswap-v3-adapter.js";

const baseConfig: ApiConfig = {
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
  KITE_BRIDGE_ROUTER: "0xD1bd49F60A6257dC96B3A040e6a1E17296A51375",
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

function createContext() {
  const updates: string[] = [];

  const context = {
    config: baseConfig,
    prisma: {
      executionIntent: {
        upsert: async () => ({
          intentId: "intent-1",
          idempotencyKey: "idem",
          agentId: "agent-1",
          marketId: "KITE_bUSDT_BASE_SEPOLIA",
          side: "BUY",
          size: "1",
          status: "QUOTED",
          quoteJson: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          failureCode: null,
          bridgeSourceTxHash: null,
          bridgeDestinationTxHash: null,
          swapTxHash: null
        }),
        update: async ({ data }: { data: { status: string } }) => {
          updates.push(data.status);
          return {};
        }
      },
      event: {
        create: async () => ({})
      }
    },
    logger: { info() {}, warn() {}, error() {} },
    io: { to() { return { emit() {} }; }, emit() {} },
    metrics: { incrementCounter() {}, observeDuration() {}, snapshot() { return {}; } },
    paymentService: { createRequirement() { return { network: "2368", asset: "0x", amount: "0.1", payTo: "p" }; }, async processPayment() { throw new Error("unused"); } },
    shopifyCatalogService: { search: async () => ({}), getProductDetails: async () => ({}) }
  } as unknown as ApiContext;

  return { context, updates };
}

function createUniswapAdapter(params: {
  baseBalance: bigint;
  swapError?: string;
}): UniswapV3Adapter {
  return {
    async readBalance() {
      return params.baseBalance;
    },
    async checkPoolLiquidity() {
      return { ok: true, poolAddress: "0x1111111111111111111111111111111111111111" as Address };
    },
    async quoteExactInputSingle() {
      return {
        amountOut: parseUnits("0.98", 18),
        poolAddress: "0x1111111111111111111111111111111111111111" as Address,
        priceImpactBps: 40,
        estimatedPrice: "0.980000"
      };
    },
    async executeExactInputSingle(paramsExec) {
      if (params.swapError) {
        throw new Error(params.swapError);
      }
      return {
        txHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
        amountIn: paramsExec.amountIn,
        amountOut: parseUnits("0.97", 18)
      };
    },
    async findRecentTransferTx() {
      return undefined;
    }
  };
}

const baseInput = {
  agentId: "agent-1",
  venueType: "SPOT" as const,
  marketId: "KITE_bUSDT_BASE_SEPOLIA",
  side: "BUY" as const,
  size: "1"
};

test("execution orchestrator maps bridge timeout deterministically", async () => {
  const { context, updates } = createContext();
  const bridgeAdapter: BridgeAdapter = {
    async estimate() {
      return { fee: 0n };
    },
    async submitBridge() {
      return {
        sourceTxHash: "0x4444444444444444444444444444444444444444444444444444444444444444",
        destinationBalanceBefore: 0n,
        destinationWatchFromBlock: 1n
      };
    },
    async waitDestinationCredit() {
      return { status: "DELAYED" };
    }
  };

  const orchestrator = createExecutionOrchestrator(context, {
    bridgeAdapter,
    uniswapAdapter: createUniswapAdapter({ baseBalance: 0n })
  });

  const result = await orchestrator.execute(baseInput, "idem-bridge-timeout");

  assert.equal(result.failureCode, "BRIDGE_TIMEOUT");
  assert.equal(result.bridge?.status, "DELAYED");
  assert.equal(updates.includes("BRIDGE_SUBMITTED"), true);
  assert.equal(updates.includes("FAILED"), true);
});

test("execution orchestrator maps destination credit miss deterministically", async () => {
  const { context } = createContext();
  const bridgeAdapter: BridgeAdapter = {
    async estimate() {
      return { fee: 0n };
    },
    async submitBridge() {
      return {
        sourceTxHash: "0x4444444444444444444444444444444444444444444444444444444444444444",
        destinationBalanceBefore: 0n,
        destinationWatchFromBlock: 1n
      };
    },
    async waitDestinationCredit() {
      return { status: "FAILED", failureCode: "DESTINATION_CREDIT_NOT_FOUND" };
    }
  };

  const orchestrator = createExecutionOrchestrator(context, {
    bridgeAdapter,
    uniswapAdapter: createUniswapAdapter({ baseBalance: 0n })
  });

  const result = await orchestrator.execute(baseInput, "idem-credit-miss");

  assert.equal(result.failureCode, "DESTINATION_CREDIT_NOT_FOUND");
  assert.equal(result.bridge?.status, "FAILED");
});

test("execution orchestrator maps swap slippage failures", async () => {
  const { context } = createContext();
  const bridgeAdapter: BridgeAdapter = {
    async estimate() {
      return { fee: 0n };
    },
    async submitBridge() {
      throw new Error("unused");
    },
    async waitDestinationCredit() {
      throw new Error("unused");
    }
  };

  const orchestrator = createExecutionOrchestrator(context, {
    bridgeAdapter,
    uniswapAdapter: createUniswapAdapter({
      baseBalance: parseUnits("5", 18),
      swapError: "Too_Little_Received"
    })
  });

  const result = await orchestrator.execute(baseInput, "idem-slippage");

  assert.equal(result.failureCode, "SLIPPAGE_EXCEEDED");
  assert.equal(result.bridge?.status, "SKIPPED");
  assert.equal(result.swap?.status, "FAILED");
});
