import { test } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import type { PaymentRequirement } from "@synoptic/types/payments";
import { ApiError } from "../utils/errors.js";
import { createPaymentService, decodePaymentHeader, type PaymentProvider } from "./payment.js";

const requirement: PaymentRequirement = {
  network: "2368",
  asset: "0xasset",
  amount: "0.10",
  payTo: "synoptic"
};

function buildPaymentHeader(signature = "sig_ok", amount = "0.10"): string {
  return Buffer.from(
    JSON.stringify({
      paymentId: "pay-1",
      signature,
      amount,
      asset: "0xasset",
      network: "2368",
      payer: "test"
    }),
    "utf-8"
  ).toString("base64url");
}

test("decodePaymentHeader rejects malformed header", () => {
  assert.throws(() => decodePaymentHeader("not-json"), ApiError);
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
      facilitatorUrl: "mock://facilitator",
      network: "2368",
      asset: "0xasset",
      amount: "0.10",
      payTo: "synoptic",
      retries: 3
    },
    provider
  );

  const settlement = await service.processPayment({
    xPaymentHeader: buildPaymentHeader(),
    requirement,
    agentId: "agent-1",
    prisma,
    route: "/markets/execute"
  });

  assert.equal(settleAttempts, 3);
  assert.equal(settlement.status, "SETTLED");
});

test("payment service rejects invalid signature", async () => {
  const service = createPaymentService({
    facilitatorUrl: "mock://facilitator",
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

  await assert.rejects(
    service.processPayment({
      xPaymentHeader: buildPaymentHeader("bad-signature"),
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
      xPaymentHeader: buildPaymentHeader(),
      requirement,
      agentId: "agent-1",
      prisma,
      route: "/markets/execute"
    }),
    (error: unknown) => error instanceof ApiError && error.code === "FACILITATOR_UNAVAILABLE"
  );
});
