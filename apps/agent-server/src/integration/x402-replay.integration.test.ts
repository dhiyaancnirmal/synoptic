import assert from "node:assert/strict";
import test from "node:test";
import { Wallet } from "ethers";
import { createServer } from "../server.js";

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
  return verify.json() as { accessToken: string };
}

test("x402 token replay is rejected by facilitator verify stage", async (t) => {
  const previousMode = process.env.KITE_PAYMENT_MODE;
  const previousUrl = process.env.KITE_FACILITATOR_URL;
  process.env.KITE_PAYMENT_MODE = "facilitator";
  process.env.KITE_FACILITATOR_URL = "https://facilitator.local";

  const usedTokens = new Set<string>();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.includes("/v2/verify")) {
      const rawBody = typeof init?.body === "string" ? init.body : "{}";
      const body = JSON.parse(rawBody) as Record<string, unknown>;
      const payload =
        body.paymentPayload && typeof body.paymentPayload === "object"
          ? (body.paymentPayload as Record<string, unknown>)
          : body;
      const key = JSON.stringify(payload);
      if (usedTokens.has(key)) {
        return new Response(
          JSON.stringify({ code: "TOKEN_REPLAY", message: "payment token was already used", valid: false }),
          { status: 409, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ valid: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    if (url.includes("/v2/settle")) {
      const rawBody = typeof init?.body === "string" ? init.body : "{}";
      const body = JSON.parse(rawBody) as Record<string, unknown>;
      const payload =
        body.paymentPayload && typeof body.paymentPayload === "object"
          ? (body.paymentPayload as Record<string, unknown>)
          : body;
      usedTokens.add(JSON.stringify(payload));
      return new Response(JSON.stringify({ settled: true, txHash: "0xsettled" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    if (url.includes("coingecko")) {
      return new Response(JSON.stringify({ ethereum: { usd: 3200 } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    return previousFetch(input, init);
  }) as typeof fetch;

  const app = await createServer();
  t.after(async () => {
    if (previousMode === undefined) delete process.env.KITE_PAYMENT_MODE;
    else process.env.KITE_PAYMENT_MODE = previousMode;
    if (previousUrl === undefined) delete process.env.KITE_FACILITATOR_URL;
    else process.env.KITE_FACILITATOR_URL = previousUrl;
    globalThis.fetch = previousFetch;
    await app.close();
  });

  const owner = Wallet.createRandom();
  const payer = Wallet.createRandom();
  const auth = await authenticate(app, owner);

  const linkIdentity = await app.inject({
    method: "POST",
    url: "/api/identity/link",
    headers: {
      authorization: `Bearer ${auth.accessToken}`
    },
    payload: {
      payerAddress: payer.address
    }
  });
  assert.equal(linkIdentity.statusCode, 200);

  const challenge = await app.inject({
    method: "GET",
    url: "/oracle/price?pair=ETH/USDT",
    headers: {
      authorization: `Bearer ${auth.accessToken}`
    }
  });
  assert.equal(challenge.statusCode, 402);
  const challengeBody = challenge.json() as {
    maxAmountRequired: string;
    paymentRequestId: string;
    payTo: string;
    asset: string;
  };

  const paymentToken = JSON.stringify({
    paymentPayload: {
      scheme: "gokite-aa",
      network: "kite-testnet",
      x402Version: 1,
      payload: {
        authorization: {
          from: payer.address,
          to: challengeBody.payTo,
          token: challengeBody.asset,
          value: challengeBody.maxAmountRequired,
          validAfter: "0",
          validBefore: "9999999999",
          nonce: "0x1111"
        },
        signature: "0xabc",
        sessionId: "session-1",
        metadata: {}
      }
    },
    paymentRequirements: challengeBody
  });

  const firstPaid = await app.inject({
    method: "GET",
    url: "/oracle/price?pair=ETH/USDT",
    headers: {
      authorization: `Bearer ${auth.accessToken}`,
      "x-payment": paymentToken,
      "x-payment-request-id": challengeBody.paymentRequestId
    }
  });
  assert.equal(firstPaid.statusCode, 200);

  const replayPaid = await app.inject({
    method: "GET",
    url: "/oracle/price?pair=ETH/USDT",
    headers: {
      authorization: `Bearer ${auth.accessToken}`,
      "x-payment": paymentToken,
      "x-payment-request-id": challengeBody.paymentRequestId
    }
  });
  assert.equal(replayPaid.statusCode, 402);
  assert.equal(replayPaid.json().code, "PAYMENT_VERIFY_FAILED");
});
