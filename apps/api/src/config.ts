import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  AUTH_MODE: z.enum(["siwe", "dev"]).default("siwe"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().url(),
  KITE_RPC_URL: z.string().url(),
  KITE_CHAIN_ID: z.coerce.number().int().positive(),
  TRADING_MODE: z.enum(["bridge_to_base_v1"]).default("bridge_to_base_v1"),
  BASE_SEPOLIA_RPC_URL: z.string().url().default("https://sepolia.base.org"),
  BASE_SEPOLIA_CHAIN_ID: z.coerce.number().int().positive().default(84532),
  BASE_UNISWAP_V3_FACTORY: z.string().min(1).default("0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24"),
  BASE_UNISWAP_V3_ROUTER: z.string().min(1).default("0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4"),
  BASE_UNISWAP_QUOTER_V2: z.string().min(1).default("0xC5290058841028F1614F3A6F0F5816cAd0df5E27"),
  KITE_BRIDGE_ROUTER: z.string().optional(),
  KITE_TOKEN_ON_BASE: z.string().default("0xFB9a6AF5C014c32414b4a6e208a89904c6dAe266"),
  BUSDT_TOKEN_ON_BASE: z.string().default("0xdAD5b9eB32831D54b7f2D8c92ef4E2A68008989C"),
  KITE_TESTNET_USDT: z.string().default("0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63"),
  SERVER_SIGNER_PRIVATE_KEY: z.string().optional(),
  BRIDGE_TIMEOUT_MS: z.coerce.number().int().positive().default(1_200_000),
  MAX_TRADE_NOTIONAL_BUSDT: z.coerce.number().positive().default(10),
  SLIPPAGE_BPS: z.coerce.number().int().positive().max(10_000).default(100),
  SWAP_DEADLINE_SECONDS: z.coerce.number().int().positive().default(300),
  SETTLEMENT_TOKEN_ADDRESS: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  SHOPIFY_API_KEY: z.string().optional(),
  SHOPIFY_CLIENT_ID: z.string().optional(),
  SHOPIFY_CLIENT_SECRET: z.string().optional(),
  SHOPIFY_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  PAYMENT_MODE: z.enum(["mock", "http"]).default("mock"),
  FACILITATOR_URL: z.string().optional(),
  FACILITATOR_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  FACILITATOR_VERIFY_PATH: z.string().default("/verify"),
  FACILITATOR_SETTLE_PATH: z.string().default("/settle"),
  PAYMENT_RETRY_ATTEMPTS: z.coerce.number().int().positive().max(5).default(3),
  X402_PAY_TO: z.string().default("synoptic-facilitator"),
  X402_PRICE_USD: z.string().default("0.10"),
  PRICE_SOURCE: z.enum(["deterministic", "oracle"]).default("deterministic"),
  SYNOPTIC_REGISTRY_ADDRESS: z.string().optional(),
  SYNOPTIC_MARKETPLACE_ADDRESS: z.string().optional()
}).superRefine((data, ctx) => {
  if (data.PAYMENT_MODE === "http") {
    if (!data.FACILITATOR_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["FACILITATOR_URL"],
        message: "FACILITATOR_URL is required when PAYMENT_MODE=http"
      });
      return;
    }

    if (!/^https?:\/\//.test(data.FACILITATOR_URL)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["FACILITATOR_URL"],
        message: "FACILITATOR_URL must be an http(s) URL when PAYMENT_MODE=http"
      });
    }

    if (data.FACILITATOR_VERIFY_PATH.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["FACILITATOR_VERIFY_PATH"],
        message: "FACILITATOR_VERIFY_PATH cannot be empty when PAYMENT_MODE=http"
      });
    }

    if (data.FACILITATOR_SETTLE_PATH.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["FACILITATOR_SETTLE_PATH"],
        message: "FACILITATOR_SETTLE_PATH cannot be empty when PAYMENT_MODE=http"
      });
    }
  }

  if (data.TRADING_MODE === "bridge_to_base_v1" && data.NODE_ENV !== "test") {
    if (!data.KITE_BRIDGE_ROUTER) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["KITE_BRIDGE_ROUTER"],
        message: "KITE_BRIDGE_ROUTER is required when TRADING_MODE=bridge_to_base_v1"
      });
    }

    if (!data.SERVER_SIGNER_PRIVATE_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SERVER_SIGNER_PRIVATE_KEY"],
        message: "SERVER_SIGNER_PRIVATE_KEY is required when TRADING_MODE=bridge_to_base_v1"
      });
    }
  }
});

export type ApiConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const paymentMode = env.PAYMENT_MODE ?? (env.FACILITATOR_URL?.startsWith("mock://") ? "mock" : undefined);

  const normalizedEnv: NodeJS.ProcessEnv = {
    ...env,
    PAYMENT_MODE: paymentMode,
    FACILITATOR_URL: env.PAYMENT_PROVIDER_URL ?? env.FACILITATOR_URL ?? (paymentMode === "http" ? undefined : "mock://facilitator"),
    FACILITATOR_TIMEOUT_MS: env.PAYMENT_PROVIDER_TIMEOUT_MS ?? env.FACILITATOR_TIMEOUT_MS,
    FACILITATOR_VERIFY_PATH: env.PAYMENT_PROVIDER_VERIFY_PATH ?? env.FACILITATOR_VERIFY_PATH,
    FACILITATOR_SETTLE_PATH: env.PAYMENT_PROVIDER_SETTLE_PATH ?? env.FACILITATOR_SETTLE_PATH
  };

  const parsed = configSchema.safeParse(normalizedEnv);

  if (!parsed.success) {
    const formatted = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid API configuration: ${formatted}`);
  }

  return parsed.data;
}
