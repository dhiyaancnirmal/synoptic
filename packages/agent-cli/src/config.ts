import { existsSync, readFileSync, writeFileSync } from "fs";
import type { Config } from "./types.js";
import { ConfigSchema } from "./types.js";
import { CONFIG_FILE } from "./wallet.js";

const ENV_MAPPINGS: Record<string, keyof Config> = {
  SYNOPTIC_DEFAULT_AMOUNT: "defaultAmount",
  SYNOPTIC_TICK_INTERVAL_MS: "tickIntervalMs",
  SYNOPTIC_MAX_RETRIES: "maxRetries",
  SYNOPTIC_BACKOFF_MS: "backoffMs",
  SYNOPTIC_API_URL: "apiUrl",
  SYNOPTIC_KITE_RPC_URL: "kiteRpcUrl",
  SYNOPTIC_MONAD_RPC_URL: "monadRpcUrl",
  SYNOPTIC_KITE_EXPLORER_URL: "kiteExplorerUrl",
  SYNOPTIC_MONAD_EXPLORER_URL: "monadExplorerUrl",
  SYNOPTIC_LOG_LEVEL: "logLevel"
};

function loadConfigFile(): Partial<Config> | null {
  if (!existsSync(CONFIG_FILE)) {
    return null;
  }

  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function loadEnvConfig(): Partial<Config> {
  const config: Partial<Config> = {};

  for (const [envKey, configKey] of Object.entries(ENV_MAPPINGS)) {
    const value = process.env[envKey];
    if (value !== undefined) {
      if (
        configKey === "tickIntervalMs" ||
        configKey === "maxRetries" ||
        configKey === "backoffMs"
      ) {
        const parsed = parseInt(value, 10);
        if (!Number.isNaN(parsed)) {
          (config as Record<string, number | undefined>)[configKey as string] = parsed;
        }
      } else {
        (config as Record<string, string | undefined>)[configKey as string] = value;
      }
    }
  }

  return config;
}

export function resolveConfig(cliOverrides: Partial<Config> = {}): Config {
  const fileConfig = loadConfigFile() ?? {};
  const envConfig = loadEnvConfig();

  const merged: Record<string, unknown> = {};

  const defaultConfig = ConfigSchema.parse({});
  for (const key of Object.keys(defaultConfig)) {
    merged[key] = defaultConfig[key as keyof Config];
  }

  if (fileConfig) {
    for (const [key, value] of Object.entries(fileConfig)) {
      if (value !== undefined) {
        merged[key] = value;
      }
    }
  }

  for (const [key, value] of Object.entries(envConfig)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }

  for (const [key, value] of Object.entries(cliOverrides)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }

  return ConfigSchema.parse(merged);
}

export function saveConfigFile(config: Partial<Config>): void {
  const existing = loadConfigFile() ?? {};
  const merged = { ...existing, ...config };
  writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), { mode: 0o600 });
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function getDefaultAmount(cliAmount?: string): string {
  if (cliAmount) return cliAmount;

  const envAmount = process.env.SYNOPTIC_DEFAULT_AMOUNT;
  if (envAmount) return envAmount;

  const fileConfig = loadConfigFile();
  if (fileConfig?.defaultAmount) return fileConfig.defaultAmount;

  return "0.01";
}
