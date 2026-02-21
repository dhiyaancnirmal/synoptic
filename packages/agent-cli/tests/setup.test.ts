import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { setupCommand } from "../src/commands/setup.js";
import { loadWallet } from "../src/wallet.js";
import { loadSession } from "../src/session.js";

const TEST_DIR = join(tmpdir(), `synoptic-agent-setup-${Date.now()}`);

describe("setup command", () => {
  let originalFetch: typeof globalThis.fetch;
  let callCount = 0;

  beforeEach(() => {
    process.env.SYNOPTIC_HOME = TEST_DIR;
    process.env.SYNOPTIC_API_URL = "https://api.test.local";
    delete process.env.KITE_MCP_BEARER_TOKEN;
    delete process.env.KITE_MCP_AUTHORIZATION;
    delete process.env.KITE_MCP_CLIENT_ID;

    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }

    callCount = 0;
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      const body =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : {};

      if (url.endsWith("/api/auth/wallet/challenge")) {
        callCount += 1;
        return new Response(
          JSON.stringify({
            challengeId: `challenge-${callCount}`,
            nonce: `nonce-${callCount}`,
            message: `Sign in ${callCount}`,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            agentId: "agent-setup",
            ownerAddress: body.ownerAddress
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/api/auth/wallet/verify")) {
        return new Response(
          JSON.stringify({
            accessToken: `access-${callCount}`,
            refreshToken: `refresh-${callCount}`,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            refreshExpiresAt: new Date(Date.now() + 120_000).toISOString(),
            agentId: "agent-setup",
            ownerAddress: body.ownerAddress ?? "0x0000000000000000000000000000000000000001"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      throw new Error(`Unexpected fetch url in setup test: ${url}`);
    }) as typeof fetch;
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    delete process.env.SYNOPTIC_HOME;
    delete process.env.SYNOPTIC_API_URL;
    globalThis.fetch = originalFetch;
  });

  it("is idempotent and persists readiness with MCP warning path", async () => {
    await setupCommand();

    const wallet1 = loadWallet();
    const session1 = loadSession();
    assert.ok(wallet1);
    assert.ok(session1);
    assert.equal(session1?.agentId, "agent-setup");
    assert.equal(session1?.readiness.walletReady, true);
    assert.equal(session1?.readiness.mcpReady, false);
    assert.equal(session1?.readiness.identityLinked, false);

    await setupCommand();

    const wallet2 = loadWallet();
    const session2 = loadSession();
    assert.ok(wallet2);
    assert.ok(session2);
    assert.equal(wallet1?.address, wallet2?.address);
    assert.equal(session2?.readiness.identityLinked, false);
    assert.ok((session2?.readiness.lastError ?? "").length > 0);
  });
});
