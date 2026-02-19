import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),
  KITE_RPC_URL: z.string().url(),
  KITE_CHAIN_ID: z.coerce.number().int().positive(),
  SETTLEMENT_TOKEN_ADDRESS: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  FACILITATOR_URL: z.string().default("mock://facilitator"),
  X402_PAY_TO: z.string().default("synoptic-facilitator"),
  X402_PRICE_USD: z.string().default("0.10")
});

export type ApiConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const parsed = configSchema.safeParse(env);

  if (!parsed.success) {
    const formatted = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid API configuration: ${formatted}`);
  }

  return parsed.data;
}
