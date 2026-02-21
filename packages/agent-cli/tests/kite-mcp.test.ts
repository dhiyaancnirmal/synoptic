import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert";
import { checkMcpAvailable } from "../src/kite-mcp.js";

const ENV_KEYS = [
  "SYNOPTIC_SKIP_MCP_CHECK",
  "KITE_MCP_BEARER_TOKEN",
  "KITE_MCP_AUTHORIZATION",
  "KITE_MCP_CLIENT_ID",
  "SYNOPTIC_ALLOW_CLIENT_ID_ONLY_MCP"
] as const;

type EnvKey = (typeof ENV_KEYS)[number];

let originalEnv: Record<EnvKey, string | undefined>;

function clearEnv(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

describe("checkMcpAvailable", () => {
  beforeEach(() => {
    originalEnv = ENV_KEYS.reduce(
      (acc, key) => {
        acc[key] = process.env[key];
        return acc;
      },
      {} as Record<EnvKey, string | undefined>
    );
    clearEnv();
  });

  afterEach(() => {
    clearEnv();
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];
      if (value !== undefined) {
        process.env[key] = value;
      }
    }
  });

  it("returns true when skip flag is enabled", () => {
    process.env.SYNOPTIC_SKIP_MCP_CHECK = "true";
    assert.equal(checkMcpAvailable(), true);
  });

  it("returns true when bearer token is provided", () => {
    process.env.KITE_MCP_BEARER_TOKEN = "test-token";
    assert.equal(checkMcpAvailable(), true);
  });

  it("returns true when full authorization header is provided", () => {
    process.env.KITE_MCP_AUTHORIZATION = "Bearer test-token";
    assert.equal(checkMcpAvailable(), true);
  });

  it("returns false for client-id-only by default", () => {
    process.env.KITE_MCP_CLIENT_ID = "client_example";
    assert.equal(checkMcpAvailable(), false);
  });

  it("returns true for client-id-only when explicitly allowed", () => {
    process.env.KITE_MCP_CLIENT_ID = "client_example";
    process.env.SYNOPTIC_ALLOW_CLIENT_ID_ONLY_MCP = "true";
    assert.equal(checkMcpAvailable(), true);
  });
});
