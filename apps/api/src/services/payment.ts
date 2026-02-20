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
  authorization: Record<string, unknown>;
  raw: Record<string, unknown>;
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

class HttpPaymentProvider implements PaymentProvider {
  constructor(
    private readonly facilitatorUrl: string,
    private readonly timeoutMs: number,
    private readonly verifyPath: string,
    private readonly settlePath: string
  ) {}

  async verify(payment: DecodedPayment, requirement: PaymentRequirement): Promise<VerifyPaymentResult> {
    void requirement;
    try {
      const response = await fetchWithTimeout(buildFacilitatorEndpoint(this.facilitatorUrl, this.verifyPath), this.timeoutMs, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildHttpProviderPayload(payment))
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
    void requirement;
    try {
      const response = await fetchWithTimeout(buildFacilitatorEndpoint(this.facilitatorUrl, this.settlePath), this.timeoutMs, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildHttpProviderPayload(payment))
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
  mode: "http";
  facilitatorUrl: string;
  verifyPath?: string;
  settlePath?: string;
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
  const paymentProvider =
    provider ??
    createPaymentProvider(config.facilitatorUrl, config.timeoutMs ?? 3000, {
      verifyPath: config.verifyPath,
      settlePath: config.settlePath
    });
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

export function createPaymentProvider(
  facilitatorUrl: string,
  timeoutMs: number,
  paths: { verifyPath?: string; settlePath?: string } = {}
): PaymentProvider {
  if (!/^https?:\/\//.test(facilitatorUrl)) {
    throw new Error("FACILITATOR_URL must be an http(s) URL");
  }

  return new HttpPaymentProvider(
    facilitatorUrl,
    timeoutMs,
    normalizeFacilitatorPath(paths.verifyPath ?? "/v2/verify"),
    normalizeFacilitatorPath(paths.settlePath ?? "/v2/settle")
  );
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

function normalizeFacilitatorPath(path: string): string {
  if (!path || path.trim().length === 0) {
    return "/";
  }

  return path.startsWith("/") ? path : `/${path}`;
}

function buildFacilitatorEndpoint(baseUrl: string, path: string): string {
  const root = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = normalizeFacilitatorPath(path);
  return `${root}${normalizedPath}`;
}

export function decodePaymentHeader(value: string): DecodedPayment {
  const parsed = parsePaymentHeaderPayload(value);
  const signature = readString(parsed, ["signature"]);
  const authorization = readRecord(parsed, ["authorization"]);

  if (!signature || !authorization) {
    throw new ApiError("INVALID_PAYMENT", 402, "X-PAYMENT must include authorization and signature");
  }

  const paymentId = extractFirstString(
    authorization.nonce,
    authorization.authorizationId,
    parsed.paymentId,
    parsed.id
  );
  const amount = extractFirstString(
    authorization.amount,
    authorization.value,
    parsed.amount
  );
  const asset = extractFirstString(
    authorization.token,
    authorization.tokenAddress,
    authorization.token_type,
    parsed.asset
  );
  const payer = extractFirstString(
    authorization.payer,
    authorization.from,
    authorization.payer_addr,
    parsed.payer
  );
  const network = extractFirstString(
    parsed.network,
    authorization.network,
    authorization.chain,
    "kite-testnet"
  );

  if (!paymentId || !amount || !asset || !payer || !network) {
    throw new ApiError("INVALID_PAYMENT", 402, "X-PAYMENT authorization is missing required fields");
  }

  return {
    paymentId,
    signature,
    amount,
    asset,
    network,
    payer,
    txHash: extractFirstString(parsed.txHash, parsed.tx_hash),
    authorization,
    raw: parsed
  };
}

function parsePaymentHeaderPayload(value: string): Record<string, unknown> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf-8"));
  } catch {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new ApiError("INVALID_PAYMENT", 402, "Invalid X-PAYMENT header encoding");
    }
  }

  if (!isRecord(parsed)) {
    throw new ApiError("INVALID_PAYMENT", 402, "X-PAYMENT header has invalid shape");
  }

  return parsed;
}

function buildHttpProviderPayload(payment: DecodedPayment): Record<string, unknown> {
  return {
    authorization: payment.authorization,
    signature: payment.signature,
    network: payment.network
  };
}

function readString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function readRecord(record: Record<string, unknown>, keys: string[]): Record<string, unknown> | undefined {
  for (const key of keys) {
    const value = record[key];
    if (isRecord(value)) {
      return value;
    }
  }
  return undefined;
}

function extractFirstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
