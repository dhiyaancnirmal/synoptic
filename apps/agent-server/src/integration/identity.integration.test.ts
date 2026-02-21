import assert from "node:assert/strict";
import test from "node:test";
import { Wallet } from "ethers";
import { createServer } from "../server.js";
import { createTestAuthToken } from "./test-auth.js";

interface MessageSigner {
  address: string;
  signMessage(message: string): Promise<string>;
}

async function authenticate(app: Awaited<ReturnType<typeof createServer>>, owner: MessageSigner) {
  const challenge = await app.inject({
    method: "POST",
    url: "/api/auth/wallet/challenge",
    payload: { ownerAddress: owner.address }
  });
  const payload = challenge.json() as { challengeId: string; message: string; agentId: string };
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
    agentId: string;
  };
}

test("identity link is idempotent and readback returns linked state", async (t) => {
  process.env.KITE_PAYMENT_MODE = "demo";
  const app = await createServer();
  t.after(async () => {
    delete process.env.KITE_PAYMENT_MODE;
    await app.close();
  });

  const owner = Wallet.createRandom();
  const payer = Wallet.createRandom();
  const auth = await authenticate(app, owner);

  const first = await app.inject({
    method: "POST",
    url: "/api/identity/link",
    headers: {
      authorization: `Bearer ${auth.accessToken}`
    },
    payload: {
      payerAddress: payer.address
    }
  });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().linked, true);

  const second = await app.inject({
    method: "POST",
    url: "/api/identity/link",
    headers: {
      authorization: `Bearer ${auth.accessToken}`
    },
    payload: {
      payerAddress: payer.address
    }
  });
  assert.equal(second.statusCode, 200);
  assert.equal(second.json().linked, true);

  const readback = await app.inject({
    method: "GET",
    url: "/api/identity",
    headers: {
      authorization: `Bearer ${auth.accessToken}`
    }
  });
  assert.equal(readback.statusCode, 200);
  assert.equal(readback.json().linked, true);
  assert.equal(readback.json().payerAddress, payer.address.toLowerCase());
});

test("identity middleware blocks owner mismatch and x-payment payer mismatch", async (t) => {
  process.env.KITE_PAYMENT_MODE = "demo";
  const app = await createServer();
  t.after(async () => {
    delete process.env.KITE_PAYMENT_MODE;
    await app.close();
  });

  const owner = Wallet.createRandom();
  const payer = Wallet.createRandom();
  const wrongOwner = Wallet.createRandom();
  const wrongPayer = Wallet.createRandom();

  const auth = await authenticate(app, owner);

  const link = await app.inject({
    method: "POST",
    url: "/api/identity/link",
    headers: { authorization: `Bearer ${auth.accessToken}` },
    payload: { payerAddress: payer.address }
  });
  assert.equal(link.statusCode, 200);

  const forgedOwnerToken = createTestAuthToken({
    agentId: auth.agentId,
    ownerAddress: wrongOwner.address
  });
  const ownerMismatch = await app.inject({
    method: "GET",
    url: "/api/identity",
    headers: { authorization: `Bearer ${forgedOwnerToken}` }
  });
  assert.equal(ownerMismatch.statusCode, 403);
  assert.equal(ownerMismatch.json().code, "OWNER_MISMATCH");

  const xPayment = JSON.stringify({
    scheme: "gokite-aa",
    network: "kite-testnet",
    x402Version: 1,
    payload: {
      authorization: {
        from: wrongPayer.address,
        to: payer.address,
        token: "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63",
        value: "1",
        validAfter: "0",
        validBefore: "9999999999",
        nonce: "0x01"
      },
      signature: "0xabc",
      sessionId: "session-1",
      metadata: {}
    }
  });

  const payerMismatch = await app.inject({
    method: "GET",
    url: "/oracle/price?pair=ETH/USDT",
    headers: {
      authorization: `Bearer ${auth.accessToken}`,
      "x-payment": xPayment,
      "x-payment-request-id": "payreq-1"
    }
  });
  assert.equal(payerMismatch.statusCode, 403);
  assert.equal(payerMismatch.json().code, "PAYER_MISMATCH");
});
