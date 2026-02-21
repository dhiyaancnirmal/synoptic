import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { resolveConfig, getDefaultAmount } from "../src/config.js";

describe("Config Module", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    const envKeys = [
      "SYNOPTIC_DEFAULT_AMOUNT",
      "SYNOPTIC_TICK_INTERVAL_MS",
      "SYNOPTIC_API_URL",
      "SYNOPTIC_LOG_LEVEL"
    ];

    for (const key of envKeys) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("should return default config values", () => {
    const config = resolveConfig();

    assert.equal(config.defaultAmount, "0.01");
    assert.equal(config.tickIntervalMs, 30000);
    assert.ok(config.apiUrl.includes("railway"));
  });

  it("should use CLI overrides over all else", () => {
    process.env.SYNOPTIC_DEFAULT_AMOUNT = "0.05";

    const config = resolveConfig({ defaultAmount: "0.10" });

    assert.equal(config.defaultAmount, "0.10");
  });

  it("should use env var over config file", () => {
    process.env.SYNOPTIC_DEFAULT_AMOUNT = "0.07";

    const amount = getDefaultAmount();

    assert.equal(amount, "0.07");
  });

  it("should use default if nothing set", () => {
    const amount = getDefaultAmount();

    assert.equal(amount, "0.01");
  });

  it("should resolve tick interval from env", () => {
    process.env.SYNOPTIC_TICK_INTERVAL_MS = "60000";

    const config = resolveConfig();

    assert.equal(config.tickIntervalMs, 60000);
  });

  it("should validate log level enum", () => {
    process.env.SYNOPTIC_LOG_LEVEL = "debug";

    const config = resolveConfig();

    assert.equal(config.logLevel, "debug");
  });

  it("should handle invalid env values gracefully", () => {
    process.env.SYNOPTIC_TICK_INTERVAL_MS = "invalid";

    const config = resolveConfig();

    assert.equal(config.tickIntervalMs, 30000);
  });
});
