import assert from "node:assert/strict";
import test from "node:test";
import { Wallet } from "ethers";
import { createServer } from "../server.js";
import { createTestAuthHeaders } from "./test-auth.js";

test("identity link + payer mismatch guard on paid endpoint", async (t) => {
  const app = await createServer();
  t.after(async () => {
    await app.close();
  });

  const owner = new Wallet("0x8b3a350cf5c34c9194ca3b5af0f89d8db6520f3f2bcb6d248d8ef2b71f7abfce");
  const created = await app.inject({
    method: "POST",
    url: "/api/agents",
    headers: createTestAuthHeaders(),
    payload: { name: "identity-agent", eoaAddress: owner.address }
  });
  assert.equal(created.statusCode, 200);

  const challenge = await app.inject({
    method: "POST",
    url: "/api/auth/wallet/challenge",
    payload: { ownerAddress: owner.address }
  });
  assert.equal(challenge.statusCode, 200);
  const challengeData = challenge.json().data as { challengeId: string; message: string };
  const signature = await owner.signMessage(challengeData.message);
  const verify = await app.inject({
    method: "POST",
    url: "/api/auth/wallet/verify",
    payload: { challengeId: challengeData.challengeId, message: challengeData.message, signature }
  });
  assert.equal(verify.statusCode, 200);
  const accessToken = verify.json().data.accessToken as string;

  const link = await app.inject({
    method: "POST",
    url: "/api/identity/link",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { payerAddress: "0x00000000000000000000000000000000000000aa" }
  });
  assert.equal(link.statusCode, 200);

  const mismatch = await app.inject({
    method: "GET",
    url: "/oracle/price?pair=ETH/USDT",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "x-payment": JSON.stringify({
        payload: { authorization: { from: "0x00000000000000000000000000000000000000bb" } }
      })
    }
  });
  assert.equal(mismatch.statusCode, 403);
  assert.equal(mismatch.json().code, "PAYER_MISMATCH");
});

