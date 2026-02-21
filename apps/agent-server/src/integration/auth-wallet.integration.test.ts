import assert from "node:assert/strict";
import test from "node:test";
import { Wallet } from "ethers";
import { createServer } from "../server.js";
import { createTestAuthHeaders } from "./test-auth.js";

test("wallet auth challenge + verify + refresh rotation works", async (t) => {
  const app = await createServer();
  t.after(async () => {
    await app.close();
  });

  const owner = new Wallet("0x59c6995e998f97a5a0044966f0945380f2fbe6f7f0f5a5f97f79ea57004a3f27");
  const canonicalAgent = await app.inject({
    method: "POST",
    url: "/api/agents",
    headers: createTestAuthHeaders(),
    payload: { name: "auth-agent", eoaAddress: owner.address }
  });
  assert.equal(canonicalAgent.statusCode, 200);

  const challenge = await app.inject({
    method: "POST",
    url: "/api/auth/wallet/challenge",
    payload: { ownerAddress: owner.address }
  });
  assert.equal(challenge.statusCode, 200);
  const challengeBody = challenge.json().data as { challengeId: string; message: string };
  const signature = await owner.signMessage(challengeBody.message);

  const verify = await app.inject({
    method: "POST",
    url: "/api/auth/wallet/verify",
    payload: {
      challengeId: challengeBody.challengeId,
      message: challengeBody.message,
      signature
    }
  });
  assert.equal(verify.statusCode, 200);
  const session = verify.json().data as {
    accessToken: string;
    refreshToken: string;
  };
  assert.ok(session.accessToken.length > 20);
  assert.ok(session.refreshToken.length > 20);

  const refresh1 = await app.inject({
    method: "POST",
    url: "/api/auth/session",
    payload: { refreshToken: session.refreshToken }
  });
  assert.equal(refresh1.statusCode, 200);
  const rotated = refresh1.json().data as { refreshToken: string };

  const refresh2 = await app.inject({
    method: "POST",
    url: "/api/auth/session",
    payload: { refreshToken: session.refreshToken }
  });
  assert.equal(refresh2.statusCode, 401);
  assert.ok(rotated.refreshToken.length > 20);
});
