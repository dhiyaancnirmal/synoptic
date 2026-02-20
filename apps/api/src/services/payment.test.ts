import { test } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import type { PaymentRequirement } from "@synoptic/types/payments";
import { ApiError } from "../utils/errors.js";
import { createPaymentProvider, createPaymentService, decodePaymentHeader, type PaymentProvider } from "./payment.js";

const requirement: PaymentRequirement = {
  network: "2368",
  asset: "0xasset",
  amount: "0.10",
  payTo: "synoptic"
};

function buildPassportPaymentHeader(overrides: Record<string, unknown> = {}): string {
  return Buffer.from(
    JSON.stringify({
      authorization: {
        nonce: "auth-1",
        amount: "0.10",
        tokenAddress: "0xasset",
        from: "0xpayer"
      },
      signature: "0xpassport_sig",
      network: "kite-testnet",
      ...overrides
    }),
    "utf-8"
  ).toString("base64url");
}

test("decodePaymentHeader rejects malformed header", () => {
  assert.throws(() => decodePaymentHeader("not-json"), ApiError);
});

test("decodePaymentHeader rejects legacy non-passport payload", () => {
  const legacy = Buffer.from(
    JSON.stringify({
      paymentId: "pay-1",
      signature: "sig_ok",
      amount: "0.10",
      asset: "0xasset",
      network: "2368",
      payer: "test"
    }),
    "utf-8"
  ).toString("base64url");

  assert.throws(() => decodePaymentHeader(legacy), ApiError);
});

test("decodePaymentHeader accepts passport-style payload", () => {
  const decoded = decodePaymentHeader(buildPassportPaymentHeader());
  assert.equal(decoded.paymentId, "auth-1");
  assert.equal(decoded.signature, "0xpassport_sig");
  assert.equal(decoded.amount, "0.10");
  assert.equal(decoded.asset, "0xasset");
  assert.equal(decoded.payer, "0xpayer");
  assert.equal(decoded.network, "kite-testnet");
});

test("payment service retries settlement and succeeds", async () => {
  let settleAttempts = 0;

  const provider: PaymentProvider = {
    async verify() {
      return { verified: true };
    },
    async settle() {
      settleAttempts += 1;
      if (settleAttempts < 3) {
        return { settled: false };
      }

      return { settled: true, txHash: "0xhash" };
    }
  };

  const prisma = {
    settlement: {
      create: async ({ data }: { data: { settlementId: string; status: "SETTLED" | "FAILED"; txHash?: string | null } }) => ({
        settlementId: data.settlementId,
        status: data.status,
        txHash: data.txHash ?? null
      })
    }
  } as unknown as PrismaClient;

  const service = createPaymentService(
    {
      mode: "http",
      facilitatorUrl: "https://facilitator.example",
      network: "2368",
      asset: "0xasset",
      amount: "0.10",
      payTo: "synoptic",
      retries: 3
    },
    provider
  );

  const settlement = await service.processPayment({
    xPaymentHeader: buildPassportPaymentHeader(),
    requirement,
    agentId: "agent-1",
    prisma,
    route: "/markets/execute"
  });

  assert.equal(settleAttempts, 3);
  assert.equal(settlement.status, "SETTLED");
});

test("payment service rejects invalid passport payload", async () => {
  const service = createPaymentService({
    mode: "http",
    facilitatorUrl: "https://facilitator.example",
    network: "2368",
    asset: "0xasset",
    amount: "0.10",
    payTo: "synoptic",
    retries: 1
  });

  const prisma = {
    settlement: {
      create: async () => {
        throw new Error("should not create");
      }
    }
  } as unknown as PrismaClient;

  const invalidHeader = Buffer.from(
    JSON.stringify({ signature: "0xno-authorization" }),
    "utf-8"
  ).toString("base64url");

  await assert.rejects(
    service.processPayment({
      xPaymentHeader: invalidHeader,
      requirement,
      agentId: "agent-1",
      prisma,
      route: "/markets/execute"
    }),
    (error: unknown) => error instanceof ApiError && error.code === "INVALID_PAYMENT"
  );
});

test("payment service maps retryable verify failures to FACILITATOR_UNAVAILABLE", async () => {
  const provider: PaymentProvider = {
    async verify() {
      return { verified: false, failureReason: "VERIFY_TIMEOUT", retryable: true };
    },
    async settle() {
      return { settled: false };
    }
  };

  const service = createPaymentService(
    {
      mode: "http",
      facilitatorUrl: "http://unreachable.local",
      network: "2368",
      asset: "0xasset",
      amount: "0.10",
      payTo: "synoptic",
      retries: 1
    },
    provider
  );

  const prisma = {
    settlement: {
      create: async () => {
        throw new Error("should not create");
      }
    }
  } as unknown as PrismaClient;

  await assert.rejects(
    service.processPayment({
      xPaymentHeader: buildPassportPaymentHeader(),
      requirement,
      agentId: "agent-1",
      prisma,
      route: "/markets/execute"
    }),
    (error: unknown) => error instanceof ApiError && error.code === "FACILITATOR_UNAVAILABLE"
  );
});

test("http payment provider uses configured verify/settle paths", async () => {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
    calls.push(String(input));
    return new Response(JSON.stringify(calls.length === 1 ? { verified: true } : { settled: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const provider = createPaymentProvider("https://facilitator.example/api", 500, {
      verifyPath: "/v2/verify",
      settlePath: "v2/settle"
    });

    const payment = decodePaymentHeader(buildPassportPaymentHeader());
    const verify = await provider.verify(payment, requirement);
    const settle = await provider.settle(payment, requirement);

    assert.equal(verify.verified, true);
    assert.equal(settle.settled, true);
    assert.deepEqual(calls, ["https://facilitator.example/api/v2/verify", "https://facilitator.example/api/v2/settle"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("http payment provider forwards facilitator-compatible passport payload", async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> => {
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    requests.push({ url: String(input), body });

    return new Response(JSON.stringify(requests.length === 1 ? { verified: true } : { settled: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const provider = createPaymentProvider("https://facilitator.example", 500, {
      verifyPath: "/v2/verify",
      settlePath: "/v2/settle"
    });

    const payment = decodePaymentHeader(buildPassportPaymentHeader());
    await provider.verify(payment, requirement);
    await provider.settle(payment, requirement);

    assert.equal(requests.length, 2);
    assert.equal(requests[0].url, "https://facilitator.example/v2/verify");
    assert.equal(requests[1].url, "https://facilitator.example/v2/settle");
    assert.deepEqual(requests[0].body, {
      authorization: {
        nonce: "auth-1",
        amount: "0.10",
        tokenAddress: "0xasset",
        from: "0xpayer"
      },
      signature: "0xpassport_sig",
      network: "kite-testnet"
    });
    assert.deepEqual(requests[1].body, requests[0].body);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
