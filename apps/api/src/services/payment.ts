import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { PaymentRequirement, PaymentSettlement } from "@synoptic/types/payments";
import { ApiError } from "../utils/errors.js";

export interface DecodedPayment {
  paymentId: string;
  signature: string;
  amount: string;
  asset: string;
  network: string;
  payer: string;
  txHash?: string;
}

export interface VerifyPaymentResult {
  verified: boolean;
  providerRef?: string;
}

export interface SettlePaymentResult {
  settled: boolean;
  txHash?: string;
  providerRef?: string;
}

export interface PaymentProvider {
  verify(payment: DecodedPayment, requirement: PaymentRequirement): Promise<VerifyPaymentResult>;
  settle(payment: DecodedPayment, requirement: PaymentRequirement): Promise<SettlePaymentResult>;
}

export interface PaymentService {
  createRequirement(): PaymentRequirement;
  processPayment(params: {
    xPaymentHeader: string;
    requirement: PaymentRequirement;
    agentId: string;
    prisma: PrismaClient;
    route: string;
  }): Promise<PaymentSettlement>;
}

class MockPaymentProvider implements PaymentProvider {
  async verify(payment: DecodedPayment, requirement: PaymentRequirement): Promise<VerifyPaymentResult> {
    const amount = Number(payment.amount);
    const expected = Number(requirement.amount);

    if (!payment.signature.startsWith("sig_") || Number.isNaN(amount) || amount < expected) {
      return { verified: false };
    }

    return { verified: true, providerRef: `mock-verify-${payment.paymentId}` };
  }

  async settle(payment: DecodedPayment): Promise<SettlePaymentResult> {
    if (payment.signature.includes("settle_fail")) {
      return { settled: false };
    }

    return {
      settled: true,
      txHash: payment.txHash ?? `0x${payment.paymentId.padEnd(64, "0").slice(0, 64)}`,
      providerRef: `mock-settle-${payment.paymentId}`
    };
  }
}

class HttpPaymentProvider implements PaymentProvider {
  constructor(private readonly facilitatorUrl: string) {}

  async verify(payment: DecodedPayment, requirement: PaymentRequirement): Promise<VerifyPaymentResult> {
    const response = await fetch(`${this.facilitatorUrl}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payment, requirement })
    });

    if (!response.ok) {
      return { verified: false };
    }

    return (await response.json()) as VerifyPaymentResult;
  }

  async settle(payment: DecodedPayment, requirement: PaymentRequirement): Promise<SettlePaymentResult> {
    const response = await fetch(`${this.facilitatorUrl}/settle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payment, requirement })
    });

    if (!response.ok) {
      return { settled: false };
    }

    return (await response.json()) as SettlePaymentResult;
  }
}

export interface PaymentServiceConfig {
  facilitatorUrl: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  retries?: number;
}

export function createPaymentService(config: PaymentServiceConfig, provider?: PaymentProvider): PaymentService {
  const paymentProvider = provider ?? createPaymentProvider(config.facilitatorUrl);
  const retries = config.retries ?? 3;

  return {
    createRequirement() {
      return {
        network: config.network,
        asset: config.asset,
        amount: config.amount,
        payTo: config.payTo
      };
    },
    async processPayment({ xPaymentHeader, requirement, agentId, prisma }) {
      const decoded = decodePaymentHeader(xPaymentHeader);
      const verified = await paymentProvider.verify(decoded, requirement);

      if (!verified.verified) {
        throw new ApiError("INVALID_PAYMENT", 402, "Payment header verification failed", {
          paymentId: decoded.paymentId
        });
      }

      let settleResult: SettlePaymentResult | undefined;
      let attempt = 0;

      while (attempt < retries) {
        settleResult = await paymentProvider.settle(decoded, requirement);
        if (settleResult.settled) {
          break;
        }

        attempt += 1;
        if (attempt < retries) {
          await sleep(backoffMs(attempt));
        }
      }

      if (!settleResult?.settled) {
        throw new ApiError("FACILITATOR_UNAVAILABLE", 503, "Unable to settle payment after retries");
      }

      const settlementId = randomUUID();
      const settlement = await prisma.settlement.create({
        data: {
          settlementId,
          agentId,
          status: "SETTLED",
          txHash: settleResult.txHash,
          providerRef: settleResult.providerRef ?? verified.providerRef
        }
      });

      return {
        settlementId: settlement.settlementId,
        status: settlement.status,
        txHash: settlement.txHash ?? undefined
      };
    }
  };
}

export function createPaymentProvider(facilitatorUrl: string): PaymentProvider {
  if (facilitatorUrl.startsWith("mock://")) {
    return new MockPaymentProvider();
  }

  return new HttpPaymentProvider(facilitatorUrl);
}

function backoffMs(attempt: number): number {
  const base = 100 * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * 50);
  return base + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function decodePaymentHeader(value: string): DecodedPayment {
  let parsed: unknown;

  try {
    const decodedRaw = Buffer.from(value, "base64url").toString("utf-8");
    parsed = JSON.parse(decodedRaw);
  } catch {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new ApiError("INVALID_PAYMENT", 402, "Invalid X-PAYMENT header encoding");
    }
  }

  if (!isDecodedPayment(parsed)) {
    throw new ApiError("INVALID_PAYMENT", 402, "X-PAYMENT header has invalid shape");
  }

  return parsed;
}

function isDecodedPayment(value: unknown): value is DecodedPayment {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.paymentId === "string" &&
    typeof candidate.signature === "string" &&
    typeof candidate.amount === "string" &&
    typeof candidate.asset === "string" &&
    typeof candidate.network === "string" &&
    typeof candidate.payer === "string"
  );
}
