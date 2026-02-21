import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSession, saveSession } from "../src/session.js";

test("session persistence writes 0600 and roundtrips", () => {
  const dir = mkdtempSync(join(tmpdir(), "synoptic-session-"));
  process.env.SYNOPTIC_HOME = dir;
  const input = {
    accessToken: "a",
    refreshToken: "r",
    accessExpiresAt: new Date().toISOString(),
    refreshExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    agentId: "agent-1",
    ownerAddress: "0x0000000000000000000000000000000000000001"
  };
  saveSession(input);
  const restored = loadSession();
  assert.ok(restored);
  assert.equal(restored?.agentId, "agent-1");
  const mode = statSync(join(dir, "session.json")).mode & 0o777;
  assert.equal(mode, 0o600);
});

