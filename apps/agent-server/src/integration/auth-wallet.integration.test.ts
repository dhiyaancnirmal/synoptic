import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { Wallet } from "ethers";
import { createServer } from "../server.js";

test("wallet challenge verify issues access+refresh and supports refresh rotation", async (t) => {
  const app = await createServer();
  t.after(async () => {
    await app.close();
  });

  const owner = Wallet.createRandom();
  const challenge = await app.inject({
    method: "POST",
    url: "/api/auth/wallet/challenge",
    payload: { ownerAddress: owner.address }
  });
  assert.equal(challenge.statusCode, 200);
  const challengePayload = challenge.json() as {
    challengeId: string;
    message: string;
    ownerAddress: string;
  };

  const signature = await owner.signMessage(challengePayload.message);
  const verified = await app.inject({
    method: "POST",
    url: "/api/auth/wallet/verify",
    payload: {
      challengeId: challengePayload.challengeId,
      message: challengePayload.message,
      signature,
      ownerAddress: challengePayload.ownerAddress
    }
  });

  assert.equal(verified.statusCode, 200);
  const authBody = verified.json() as {
    accessToken: string;
    refreshToken: string;
    ownerAddress: string;
  };
  assert.ok(authBody.accessToken.length > 10);
  assert.ok(authBody.refreshToken.length > 10);
  assert.equal(authBody.ownerAddress, owner.address.toLowerCase());

  const sessionRead = await app.inject({
    method: "GET",
    url: "/api/auth/session",
    headers: {
      authorization: `Bearer ${authBody.accessToken}`
    }
  });
  assert.equal(sessionRead.statusCode, 200);
  assert.equal(sessionRead.json().ownerAddress, owner.address.toLowerCase());

  const refreshed = await app.inject({
    method: "POST",
    url: "/api/auth/session",
    payload: {
      refreshToken: authBody.refreshToken
    }
  });
  assert.equal(refreshed.statusCode, 200);
  const refreshedBody = refreshed.json() as { accessToken: string; refreshToken: string };
  assert.ok(refreshedBody.accessToken.length > 10);
  assert.notEqual(refreshedBody.refreshToken, authBody.refreshToken);

  const reusedRefresh = await app.inject({
    method: "POST",
    url: "/api/auth/session",
    payload: {
      refreshToken: authBody.refreshToken
    }
  });
  assert.equal(reusedRefresh.statusCode, 401);
  assert.equal(reusedRefresh.json().code, "INVALID_REFRESH_TOKEN");
});

test("wallet verify rejects invalid signatures and challenge replay", async (t) => {
  const app = await createServer();
  t.after(async () => {
    await app.close();
  });

  const owner = Wallet.createRandom();
  const attacker = Wallet.createRandom();

  const challenge = await app.inject({
    method: "POST",
    url: "/api/auth/wallet/challenge",
    payload: { ownerAddress: owner.address }
  });
  const challengePayload = challenge.json() as { challengeId: string; message: string };

  const badSignature = await attacker.signMessage(challengePayload.message);
  const badVerify = await app.inject({
    method: "POST",
    url: "/api/auth/wallet/verify",
    payload: {
      challengeId: challengePayload.challengeId,
      message: challengePayload.message,
      signature: badSignature
    }
  });
  assert.equal(badVerify.statusCode, 401);
  assert.equal(badVerify.json().code, "SIGNATURE_MISMATCH");

  const nextChallenge = await app.inject({
    method: "POST",
    url: "/api/auth/wallet/challenge",
    payload: { ownerAddress: owner.address }
  });
  const nextPayload = nextChallenge.json() as { challengeId: string; message: string };
  const signature = await owner.signMessage(nextPayload.message);
  const okVerify = await app.inject({
    method: "POST",
    url: "/api/auth/wallet/verify",
    payload: {
      challengeId: nextPayload.challengeId,
      message: nextPayload.message,
      signature
    }
  });
  assert.equal(okVerify.statusCode, 200);

  const replayVerify = await app.inject({
    method: "POST",
    url: "/api/auth/wallet/verify",
    payload: {
      challengeId: nextPayload.challengeId,
      message: nextPayload.message,
      signature
    }
  });
  assert.equal(replayVerify.statusCode, 401);
  assert.equal(replayVerify.json().code, "INVALID_CHALLENGE");
});

test("wallet challenge expires according to AUTH_CHALLENGE_TTL_MS", async (t) => {
  const previousTtl = process.env.AUTH_CHALLENGE_TTL_MS;
  process.env.AUTH_CHALLENGE_TTL_MS = "10";

  const app = await createServer();
  t.after(async () => {
    if (previousTtl === undefined) {
      delete process.env.AUTH_CHALLENGE_TTL_MS;
    } else {
      process.env.AUTH_CHALLENGE_TTL_MS = previousTtl;
    }
    await app.close();
  });

  const owner = Wallet.createRandom();
  const challenge = await app.inject({
    method: "POST",
    url: "/api/auth/wallet/challenge",
    payload: { ownerAddress: owner.address }
  });
  const payload = challenge.json() as { challengeId: string; message: string };
  const signature = await owner.signMessage(payload.message);

  await sleep(30);

  const expiredVerify = await app.inject({
    method: "POST",
    url: "/api/auth/wallet/verify",
    payload: {
      challengeId: payload.challengeId,
      message: payload.message,
      signature
    }
  });

  assert.equal(expiredVerify.statusCode, 401);
  assert.equal(expiredVerify.json().code, "INVALID_CHALLENGE");
});
