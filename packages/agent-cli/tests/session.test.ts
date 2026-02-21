import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync, statSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { clearSession, getSessionPath, loadSession, saveSession } from "../src/session.js";

const TEST_DIR = join(tmpdir(), `synoptic-agent-session-${Date.now()}`);

describe("session persistence", () => {
  beforeEach(() => {
    process.env.SYNOPTIC_HOME = TEST_DIR;
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    delete process.env.SYNOPTIC_HOME;
  });

  it("writes ~/.synoptic/session.json with secure permissions", () => {
    const data = saveSession({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accessExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      refreshExpiresAt: new Date(Date.now() + 120_000).toISOString(),
      agentId: "agent-1",
      ownerAddress: "0x0000000000000000000000000000000000000001",
      linkedPayerAddress: "0x0000000000000000000000000000000000000002",
      readiness: {
        walletReady: true,
        mcpReady: false,
        identityLinked: false,
        checkedAt: new Date().toISOString()
      }
    });

    assert.equal(data.version, 1);
    assert.equal(existsSync(getSessionPath()), true);

    const mode = statSync(getSessionPath()).mode & 0o777;
    assert.equal(mode, 0o600);

    const loaded = loadSession();
    assert.ok(loaded);
    assert.equal(loaded?.agentId, "agent-1");
    assert.equal(loaded?.linkedPayerAddress, "0x0000000000000000000000000000000000000002");
  });

  it("clears persisted session", () => {
    saveSession({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accessExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      refreshExpiresAt: new Date(Date.now() + 120_000).toISOString(),
      agentId: "agent-1",
      ownerAddress: "0x0000000000000000000000000000000000000001",
      readiness: {
        walletReady: true,
        mcpReady: true,
        identityLinked: false,
        checkedAt: new Date().toISOString()
      }
    });

    assert.equal(clearSession(), true);
    assert.equal(loadSession(), null);
  });
});
