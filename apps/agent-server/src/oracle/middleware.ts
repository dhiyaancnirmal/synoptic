import type { FastifyRequest, FastifyReply } from "fastify";
import { canSpend, type PaymentAdapter } from "@synoptic/agent-core";
import type { ActivityEvent, Payment } from "@synoptic/types";
import type { RuntimeStoreContract } from "../state/runtime-store.js";

const DEFAULT_PAYMENT_USD = 0.25;
const DEFAULT_SERVICE_URL = "/oracle/price";

interface OraclePaymentDeps {
  store: RuntimeStoreContract;
  paymentAdapter: PaymentAdapter;
  network: string;
  payToAddress: string;
  paymentAssetAddress: string;
  budgetResetTimeZone: string;
  enforceLocalBudget: boolean;
  onPayment?: (payment: Payment) => void;
  onActivity?: (event: ActivityEvent) => void;
}

function parsePaymentUsd(request: FastifyRequest): number {
  const raw = (request.query as { costUsd?: string } | undefined)?.costUsd;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PAYMENT_USD;
}

const dayFormatterCache = new Map<string, Intl.DateTimeFormat>();

function toUtcDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "invalid-date";
  return date.toISOString().slice(0, 10);
}

export function dayBucket(value: string, timeZone: string): string {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return toUtcDay(value);

    const cached = dayFormatterCache.get(timeZone);
    const formatter =
      cached ??
      new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      });
    if (!cached) dayFormatterCache.set(timeZone, formatter);

    const parts = formatter.formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (!year || !month || !day) return toUtcDay(value);

    return `${year}-${month}-${day}`;
  } catch {
    return toUtcDay(value);
  }
}

function decodeAgentIdFromAuth(request: FastifyRequest): string | undefined {
  const auth = request.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return undefined;
  const token = auth.slice("Bearer ".length).trim();
  const [, payload] = token.split(".");
  if (!payload) return undefined;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    const decoded = JSON.parse(Buffer.from(padded, "base64").toString("utf-8")) as { agentId?: string };
    return decoded.agentId;
  } catch {
    return undefined;
  }
}

async function resolveAgentId(request: FastifyRequest, store: RuntimeStoreContract): Promise<string | undefined> {
  const queryAgent = (request.query as { agentId?: string } | undefined)?.agentId;
  if (queryAgent && (await store.getAgent(queryAgent))) return queryAgent;

  const authAgent = decodeAgentIdFromAuth(request);
  if (authAgent && (await store.getAgent(authAgent))) return authAgent;

  const agents = await store.listAgents();
  return agents[0]?.id;
}

async function emitActivity(
  deps: OraclePaymentDeps,
  input: { agentId: string; eventType: string; paymentId: string; data?: Record<string, unknown> }
): Promise<void> {
  const event = await deps.store.addActivity(input.agentId, input.eventType, "kite-testnet", {
    paymentId: input.paymentId,
    ...(input.data ?? {})
  });
  deps.onActivity?.(event);
}

function buildChallenge(
  input: { requestId: string; amountUsd: number; pair: string },
  deps: OraclePaymentDeps
) {
  const challenge = {
    x402Version: 1,
    scheme: "gokite-aa",
    network: deps.network,
    asset: deps.paymentAssetAddress,
    payTo: deps.payToAddress,
    maxAmountRequired: input.amountUsd.toFixed(2),
    maxTimeoutSeconds: 120,
    accepts: [
      {
        scheme: "gokite-aa",
        network: deps.network,
        maxAmountRequired: input.amountUsd.toFixed(2),
        resource: DEFAULT_SERVICE_URL,
        description: "Synoptic Oracle Price API",
        mimeType: "application/json",
        outputSchema: {
          input: {
            discoverable: true,
            method: "GET",
            queryParams: {
              pair: { description: "Token pair", required: true, type: "string" }
            },
            type: "http"
          },
          output: {
            type: "object",
            required: ["pair", "price", "timestamp", "source"],
            properties: {
              pair: { type: "string" },
              price: { type: "number" },
              timestamp: { type: "number" },
              source: { type: "string" }
            }
          }
        },
        payTo: deps.payToAddress,
        maxTimeoutSeconds: 120,
        asset: deps.paymentAssetAddress,
        extra: null,
        merchantName: "Synoptic Oracle"
      }
    ],
    paymentRequestId: input.requestId
  };

  return challenge;
}

export async function requireX402Payment(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: OraclePaymentDeps
): Promise<boolean> {
  const agentId = await resolveAgentId(request, deps.store);
  if (!agentId) {
    reply.status(400).send({ code: "NO_AGENT", message: "No agent available for payment routing" });
    return false;
  }

  const paymentUsd = parsePaymentUsd(request);
  const pair = ((request.query as { pair?: string } | undefined)?.pair ?? "ETH/USDT").toUpperCase();
  const payment = request.headers["x-payment"];
  if (typeof payment !== "string" || payment.length === 0) {
    const created = await deps.store.createPayment({
      agentId,
      direction: "outgoing",
      amountWei: "0",
      amountUsd: paymentUsd.toFixed(2),
      tokenAddress: deps.paymentAssetAddress,
      serviceUrl: DEFAULT_SERVICE_URL,
      status: "requested"
    });
    const challenge = buildChallenge(
      {
        requestId: created.id,
        amountUsd: paymentUsd,
        pair
      },
      deps
    );
    await deps.store.updatePaymentStatus(created.id, "requested", {
      facilitatorResponse: { stage: "challenge_issued" }
    });
    const requested = await deps.store.getPayment(created.id);
    if (requested) deps.onPayment?.(requested);
    await emitActivity(deps, {
      agentId,
      eventType: "payment.requested",
      paymentId: created.id,
      data: { pair, amountUsd: created.amountUsd }
    });

    reply.status(402).send({
      ...challenge,
      message: "Payment required"
    });
    return false;
  }

  const paymentRecordIdHeader = request.headers["x-payment-request-id"];
  const paymentRecordId =
    typeof paymentRecordIdHeader === "string" && paymentRecordIdHeader.length > 0
      ? paymentRecordIdHeader
      : undefined;
  const existing = paymentRecordId
    ? await deps.store.getPayment(paymentRecordId)
    : undefined;
  const candidate =
    existing ??
    (await deps.store.createPayment({
      agentId,
      direction: "outgoing",
      amountWei: "0",
      amountUsd: paymentUsd.toFixed(2),
      tokenAddress: deps.paymentAssetAddress,
      serviceUrl: DEFAULT_SERVICE_URL,
      status: "requested"
    }));

  const authorized = await deps.paymentAdapter.verify(payment);
  if (!authorized.authorized) {
    const failed = await deps.store.updatePaymentStatus(candidate.id, "failed", {
      facilitatorResponse: { stage: "verify", reason: authorized.reason ?? "unauthorized" }
    });
    if (failed) deps.onPayment?.(failed);
    await emitActivity(deps, {
      agentId,
      eventType: "payment.failed",
      paymentId: candidate.id,
      data: { stage: "verify", reason: authorized.reason ?? "unauthorized" }
    });
    reply.status(402).send({ code: "PAYMENT_VERIFY_FAILED", message: "Payment verification failed" });
    return false;
  }

  const authorizedPayment = await deps.store.updatePaymentStatus(candidate.id, "authorized", {
    facilitatorResponse: { stage: "authorized" }
  });
  if (authorizedPayment) deps.onPayment?.(authorizedPayment);
  await emitActivity(deps, {
    agentId,
    eventType: "payment.authorized",
    paymentId: candidate.id,
    data: { pair, amountUsd: candidate.amountUsd }
  });

  const agent = await deps.store.getAgent(agentId);
  if (!agent) {
    reply.status(404).send({ code: "AGENT_NOT_FOUND", message: "Agent not found" });
    return false;
  }
  const allPayments = await deps.store.listPayments();
  const today = dayBucket(new Date().toISOString(), deps.budgetResetTimeZone);
  const spentToday = allPayments
    .filter((entry) => entry.agentId === agentId && entry.status === "settled" && entry.settledAt)
    .filter((entry) => dayBucket(entry.settledAt ?? entry.createdAt, deps.budgetResetTimeZone) === today)
    .reduce((sum, entry) => sum + Number(entry.amountUsd), 0);
  const withinBudget = canSpend(spentToday, Number(agent.dailyBudgetUsd), paymentUsd);
  if (deps.enforceLocalBudget && !withinBudget) {
    const failed = await deps.store.updatePaymentStatus(candidate.id, "failed", {
      facilitatorResponse: { stage: "budget", reason: "daily_budget_exceeded" }
    });
    if (failed) deps.onPayment?.(failed);
    await emitActivity(deps, {
      agentId,
      eventType: "payment.failed",
      paymentId: candidate.id,
      data: {
        stage: "budget",
        reason: "daily_budget_exceeded",
        spentTodayUsd: spentToday.toFixed(2),
        dailyBudgetUsd: agent.dailyBudgetUsd
      }
    });
    reply.status(403).send({
      code: "BUDGET_EXCEEDED",
      message: "Daily budget exceeded for agent",
      details: {
        spentTodayUsd: spentToday.toFixed(2),
        dailyBudgetUsd: agent.dailyBudgetUsd
      }
    });
    return false;
  }

  const result = await deps.paymentAdapter.settle(payment);
  if (!result.settled) {
    const failed = await deps.store.updatePaymentStatus(candidate.id, "failed", {
      facilitatorResponse: { stage: "settle", reason: result.reason ?? "settlement_failed" }
    });
    if (failed) deps.onPayment?.(failed);
    await emitActivity(deps, {
      agentId,
      eventType: "payment.failed",
      paymentId: candidate.id,
      data: { stage: "settle", reason: result.reason ?? "settlement_failed" }
    });
    reply.status(402).send({ code: "PAYMENT_SETTLE_FAILED", message: "Payment settlement failed" });
    return false;
  }

  const settled = await deps.store.updatePaymentStatus(candidate.id, "settled", {
    kiteTxHash: result.txHash,
    facilitatorResponse: { stage: "settled" }
  });
  if (settled) deps.onPayment?.(settled);
  await emitActivity(deps, {
    agentId,
    eventType: "payment.settled",
    paymentId: candidate.id,
    data: { txHash: result.txHash, amountUsd: candidate.amountUsd, pair }
  });
  await deps.store.setAgentSpentTodayUsd(agentId, (spentToday + paymentUsd).toFixed(2));

  return true;
}
