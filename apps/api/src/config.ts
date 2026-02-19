import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),
  KITE_RPC_URL: z.string().url(),
  KITE_CHAIN_ID: z.coerce.number().int().positive(),
  SETTLEMENT_TOKEN_ADDRESS: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  SHOPIFY_API_KEY: z.string().optional(),
  SHOPIFY_CLIENT_ID: z.string().optional(),
  SHOPIFY_CLIENT_SECRET: z.string().optional(),
  FACILITATOR_URL: z.string().default("mock://facilitator"),
  FACILITATOR_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  PAYMENT_RETRY_ATTEMPTS: z.coerce.number().int().positive().max(5).default(3),
  X402_PAY_TO: z.string().default("synoptic-facilitator"),
  X402_PRICE_USD: z.string().default("0.10")
});

export type ApiConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const normalizedEnv: NodeJS.ProcessEnv = {
    ...env,
    FACILITATOR_URL: env.PAYMENT_PROVIDER_URL ?? env.FACILITATOR_URL,
    FACILITATOR_TIMEOUT_MS: env.PAYMENT_PROVIDER_TIMEOUT_MS ?? env.FACILITATOR_TIMEOUT_MS
  };

  const parsed = configSchema.safeParse(normalizedEnv);

  if (!parsed.success) {
    const formatted = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid API configuration: ${formatted}`);
  }

  return parsed.data;
}
