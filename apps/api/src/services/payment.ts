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
  failureReason?: string;
  retryable?: boolean;
}

export interface SettlePaymentResult {
  settled: boolean;
  txHash?: string;
  providerRef?: string;
  failureReason?: string;
  retryable?: boolean;
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
  constructor(
    private readonly facilitatorUrl: string,
    private readonly timeoutMs: number
  ) {}

  async verify(payment: DecodedPayment, requirement: PaymentRequirement): Promise<VerifyPaymentResult> {
    try {
      const response = await fetchWithTimeout(`${this.facilitatorUrl}/verify`, this.timeoutMs, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payment, requirement })
      });

      if (!response.ok) {
        return { verified: false, failureReason: "VERIFY_REJECTED", retryable: response.status >= 500 };
      }

      return (await response.json()) as VerifyPaymentResult;
    } catch (error) {
      return {
        verified: false,
        failureReason: isAbortError(error) ? "VERIFY_TIMEOUT" : "VERIFY_NETWORK_ERROR",
        retryable: true
      };
    }
  }

  async settle(payment: DecodedPayment, requirement: PaymentRequirement): Promise<SettlePaymentResult> {
    try {
      const response = await fetchWithTimeout(`${this.facilitatorUrl}/settle`, this.timeoutMs, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payment, requirement })
      });

      if (!response.ok) {
        return { settled: false, failureReason: "SETTLE_REJECTED", retryable: response.status >= 500 };
      }

      return (await response.json()) as SettlePaymentResult;
    } catch (error) {
      return {
        settled: false,
        failureReason: isAbortError(error) ? "SETTLE_TIMEOUT" : "SETTLE_NETWORK_ERROR",
        retryable: true
      };
    }
  }
}

export interface PaymentServiceConfig {
  mode: "mock" | "http";
  facilitatorUrl: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  retries?: number;
  timeoutMs?: number;
  metrics?: {
    incrementCounter(name: string): void;
  };
}

export function createPaymentService(config: PaymentServiceConfig, provider?: PaymentProvider): PaymentService {
  const paymentProvider = provider ?? createPaymentProvider(config.mode, config.facilitatorUrl, config.timeoutMs ?? 3000);
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
      config.metrics?.incrementCounter("payment.verify.attempt");
      const verified = await paymentProvider.verify(decoded, requirement);

      if (!verified.verified) {
        config.metrics?.incrementCounter("payment.verify.failure");
        if (verified.retryable) {
          throw new ApiError("FACILITATOR_UNAVAILABLE", 503, "Payment verification unavailable", {
            paymentId: decoded.paymentId,
            reason: verified.failureReason ?? "VERIFY_UNAVAILABLE",
            retryable: true
          });
        }

        throw new ApiError("INVALID_PAYMENT", 402, "Payment header verification failed", {
          paymentId: decoded.paymentId,
          reason: verified.failureReason ?? "PAYMENT_VERIFICATION_FAILED",
          retryable: verified.retryable ?? false
        });
      }

      let settleResult: SettlePaymentResult | undefined;
      let attempt = 0;

      while (attempt < retries) {
        config.metrics?.incrementCounter("payment.settle.attempt");
        settleResult = await paymentProvider.settle(decoded, requirement);
        if (settleResult.settled) {
          break;
        }

        config.metrics?.incrementCounter("payment.settle.failure");
        attempt += 1;
        if (attempt < retries) {
          await sleep(backoffMs(attempt));
        }
      }

      if (!settleResult?.settled) {
        throw new ApiError("FACILITATOR_UNAVAILABLE", 503, "Unable to settle payment after retries", {
          reason: settleResult?.failureReason ?? "SETTLEMENT_FAILED",
          retryable: settleResult?.retryable ?? true
        });
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

export function createPaymentProvider(mode: "mock" | "http", facilitatorUrl: string, timeoutMs: number): PaymentProvider {
  if (mode === "mock") {
    return new MockPaymentProvider();
  }

  if (!/^https?:\/\//.test(facilitatorUrl)) {
    throw new Error("FACILITATOR_URL must be an http(s) URL when PAYMENT_MODE=http");
  }

  return new HttpPaymentProvider(facilitatorUrl, timeoutMs);
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

async function fetchWithTimeout(url: string, timeoutMs: number, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
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
