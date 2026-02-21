import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "./server.js";
import type { FacilitatorEnv } from "./env.js";
import type { NormalizedPaymentRequest, SettlementClient } from "./types.js";

const TEST_ENV: FacilitatorEnv = {
  port: 4010,
  rpcUrl: "https://rpc-testnet.gokite.ai/",
  privateKey: "0x" + "11".repeat(32),
  canonicalScheme: "gokite-aa",
  canonicalNetwork: "kite-testnet",
  chainId: 2368,
  settleConfirmations: 1
};

function makeBody(
  overrides: Partial<{
    scheme: string;
    network: string;
    maxAmountRequired: string;
    value: string;
  }> = {}
): Record<string, unknown> {
  const scheme = overrides.scheme ?? "gokite-aa";
  const network = overrides.network ?? "kite-testnet";
  const value = overrides.value ?? "250000";
  const maxAmountRequired = overrides.maxAmountRequired ?? "250000";
  const token = "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63";
  const payTo = "0x12343e649e6b2b2b77649DFAb88f103c02F3C78b";

  return {
    paymentPayload: {
      scheme,
      network,
      x402Version: 1,
      payload: {
        authorization: {
          from: "0x66ad7ef70cc88e37fa692d85c8a55ed4c1493251",
          nonce: "0x" + "22".repeat(32),
          to: payTo,
          token,
          validAfter: "1771649018",
          validBefore: "1772235625",
          value
        },
        sessionId: "0x" + "44".repeat(32),
        metadata: "merchant=Synoptic|method=x402",
        signature: "0x" + "33".repeat(65)
      },
    },
    paymentRequirements: {
      x402Version: 1,
      scheme,
      network,
      asset: token,
      payTo,
      maxAmountRequired
    }
  };
}

test("POST /v2/verify rejects tuple mismatch", async (t) => {
  const settlementClient: SettlementClient = {
    async simulate() {},
    async settle() {
      return "0xdead";
    }
  };
  const app = await createServer({ env: TEST_ENV, settlementClient });
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/v2/verify",
    payload: makeBody({ scheme: "exact" })
  });
  assert.equal(response.statusCode, 400);
  const body = response.json();
  assert.equal(body.code, "tuple_mismatch_scheme");
});

test("POST /v2/verify rejects malformed payloads", async (t) => {
  const settlementClient: SettlementClient = {
    async simulate() {},
    async settle() {
      return "0xdead";
    }
  };
  const app = await createServer({ env: TEST_ENV, settlementClient });
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/v2/verify",
    payload: { paymentPayload: { scheme: "gokite-aa" } }
  });
  assert.equal(response.statusCode, 400);
  const body = response.json();
  assert.equal(body.code, "missing_authorization");
});

test("POST /v2/verify returns valid true with normalized payment", async (t) => {
  let simulateCalled = false;
  const settlementClient: SettlementClient = {
    async simulate(input: NormalizedPaymentRequest) {
      simulateCalled = true;
      assert.equal(input.network, "kite-testnet");
      assert.equal(input.scheme, "gokite-aa");
      assert.equal(input.maxAmountRequired, "250000");
    },
    async settle() {
      return "0xdead";
    }
  };
  const app = await createServer({ env: TEST_ENV, settlementClient });
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/v2/verify",
    payload: makeBody()
  });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.valid, true);
  assert.equal(simulateCalled, true);
});

test("POST /v2/verify accepts base64 xPayment with explicit requirements", async (t) => {
  const settlementClient: SettlementClient = {
    async simulate(input: NormalizedPaymentRequest) {
      assert.equal(input.sessionId.length, 66);
      assert.equal(input.metadataBytes.startsWith("0x"), true);
    },
    async settle() {
      return "0xdead";
    }
  };
  const app = await createServer({ env: TEST_ENV, settlementClient });
  t.after(async () => {
    await app.close();
  });

  const rawPayment = {
    scheme: "gokite-aa",
    network: "kite-testnet",
    x402Version: 1,
    payload: {
      authorization: {
        from: "0x66ad7ef70cc88e37fa692d85c8a55ed4c1493251",
        nonce: "0x" + "22".repeat(32),
        to: "0x12343e649e6b2b2b77649DFAb88f103c02F3C78b",
        token: "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63",
        validAfter: "1771649018",
        validBefore: "1772235625",
        value: "250000"
      },
      sessionId: "0x" + "55".repeat(32),
      metadata: "merchant=Synoptic|method=x402",
      signature: "0x" + "33".repeat(65)
    }
  };

  const response = await app.inject({
    method: "POST",
    url: "/v2/verify",
    payload: {
      xPayment: Buffer.from(JSON.stringify(rawPayment), "utf-8").toString("base64"),
      paymentRequirements: {
        x402Version: 1,
        scheme: "gokite-aa",
        network: "kite-testnet",
        asset: "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63",
        payTo: "0x12343e649e6b2b2b77649DFAb88f103c02F3C78b",
        maxAmountRequired: "250000"
      }
    }
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().valid, true);
});

test("POST /v2/settle returns txHash on success", async (t) => {
  const settlementClient: SettlementClient = {
    async simulate() {},
    async settle() {
      return "0xabc123";
    }
  };
  const app = await createServer({ env: TEST_ENV, settlementClient });
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/v2/settle",
    payload: makeBody()
  });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.settled, true);
  assert.equal(body.txHash, "0xabc123");
});
