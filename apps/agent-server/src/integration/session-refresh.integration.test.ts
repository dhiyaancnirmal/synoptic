import assert from "node:assert/strict";
import test from "node:test";
import { Wallet } from "ethers";
import { createServer } from "../server.js";

async function authenticate(app: Awaited<ReturnType<typeof createServer>>, owner: Wallet) {
  const challenge = await app.inject({
    method: "POST",
    url: "/api/auth/wallet/challenge",
    payload: { ownerAddress: owner.address }
  });
  const payload = challenge.json() as { challengeId: string; message: string };
  const signature = await owner.signMessage(payload.message);
  const verify = await app.inject({
    method: "POST",
    url: "/api/auth/wallet/verify",
    payload: {
      challengeId: payload.challengeId,
      message: payload.message,
      signature
    }
  });
  return verify.json() as {
    accessToken: string;
    refreshToken: string;
  };
}

test("session refresh rejects invalid and expired-style tokens", async (t) => {
  const app = await createServer();
  t.after(async () => {
    await app.close();
  });

  const owner = Wallet.createRandom();
  const auth = await authenticate(app, owner);

  const invalid = await app.inject({
    method: "POST",
    url: "/api/auth/session",
    payload: { refreshToken: `${auth.refreshToken}broken` }
  });
  assert.equal(invalid.statusCode, 401);
  assert.equal(invalid.json().code, "INVALID_REFRESH_TOKEN");

  const firstRefresh = await app.inject({
    method: "POST",
    url: "/api/auth/session",
    payload: { refreshToken: auth.refreshToken }
  });
  assert.equal(firstRefresh.statusCode, 200);

  const replay = await app.inject({
    method: "POST",
    url: "/api/auth/session",
    payload: { refreshToken: auth.refreshToken }
  });
  assert.equal(replay.statusCode, 401);
  assert.equal(replay.json().code, "INVALID_REFRESH_TOKEN");
});
