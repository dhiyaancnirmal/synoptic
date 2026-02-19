import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  AUTH_MODE: z.enum(["siwe", "dev"]).default("siwe"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().url(),
  KITE_RPC_URL: z.string().url(),
  KITE_CHAIN_ID: z.coerce.number().int().positive(),
  SETTLEMENT_TOKEN_ADDRESS: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  SHOPIFY_API_KEY: z.string().optional(),
  SHOPIFY_CLIENT_ID: z.string().optional(),
  SHOPIFY_CLIENT_SECRET: z.string().optional(),
  SHOPIFY_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  PAYMENT_MODE: z.enum(["mock", "http"]).default("mock"),
  FACILITATOR_URL: z.string().optional(),
  FACILITATOR_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
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
  }
});

export type ApiConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const paymentMode = env.PAYMENT_MODE ?? (env.FACILITATOR_URL?.startsWith("mock://") ? "mock" : undefined);

  const normalizedEnv: NodeJS.ProcessEnv = {
    ...env,
    PAYMENT_MODE: paymentMode,
    FACILITATOR_URL: env.PAYMENT_PROVIDER_URL ?? env.FACILITATOR_URL ?? (paymentMode === "http" ? undefined : "mock://facilitator"),
    FACILITATOR_TIMEOUT_MS: env.PAYMENT_PROVIDER_TIMEOUT_MS ?? env.FACILITATOR_TIMEOUT_MS
  };

  const parsed = configSchema.safeParse(normalizedEnv);

  if (!parsed.success) {
    const formatted = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid API configuration: ${formatted}`);
  }

  return parsed.data;
}
