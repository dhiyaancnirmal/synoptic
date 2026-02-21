import type { FastifyRequest, FastifyReply } from "fastify";
import { parseUnits } from "ethers";
import { canSpend, type PaymentAdapter } from "@synoptic/agent-core";
import type { ActivityEvent, Payment } from "@synoptic/types";
import type { RuntimeStoreContract } from "../state/runtime-store.js";

const DEFAULT_PAYMENT_USD = 0.25;
const DEFAULT_PAYMENT_ASSET_DECIMALS = 6;
const DEFAULT_SERVICE_URL = "/oracle/price";
const DEFAULT_PAYMENT_SCHEME = "gokite-aa";
const DEFAULT_PAYMENT_NETWORK = "kite-testnet";
const DEFAULT_X402_VERSION = 1;

interface OraclePaymentDeps {
  store: RuntimeStoreContract;
  paymentAdapter: PaymentAdapter;
  paymentScheme: string;
  network: string;
  payToAddress: string;
  paymentAssetAddress: string;
  paymentAssetDecimals: number;
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

function normalizePaymentScheme(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_PAYMENT_SCHEME;
}

function normalizePaymentNetwork(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_PAYMENT_NETWORK;
}

function normalizeDecimals(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_PAYMENT_ASSET_DECIMALS;
  return Math.min(18, Math.floor(value));
}

function toAtomicAmount(amountUsd: number, decimals: number): string {
  const normalizedDecimals = normalizeDecimals(decimals);
  const asDecimal = amountUsd.toFixed(normalizedDecimals);
  return parseUnits(asDecimal, normalizedDecimals).toString();
}

function readString(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function tryJson(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    return undefined;
  } catch {
    return undefined;
  }
}

function decodeBase64(value: string): string | undefined {
  try {
    return Buffer.from(value, "base64").toString("utf-8");
  } catch {
    return undefined;
  }
}

function decodeBase64Url(value: string): string | undefined {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    return Buffer.from(padded, "base64").toString("utf-8");
  } catch {
    return undefined;
  }
}

function parseXPaymentHeader(value: string): Record<string, unknown> | undefined {
  const raw = value.trim();
  if (!raw) return undefined;
  const direct = tryJson(raw);
  if (direct) return direct;
  const fromB64 = decodeBase64(raw);
  if (fromB64) {
    const parsed = tryJson(fromB64);
    if (parsed) return parsed;
  }
  const fromB64Url = decodeBase64Url(raw);
  if (fromB64Url) {
    const parsed = tryJson(fromB64Url);
    if (parsed) return parsed;
  }
  return undefined;
}

function maskAddress(value: string | undefined): string | undefined {
  if (!value || value.length < 10) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function summarizeXPayment(value: string): Record<string, unknown> {
  const parsed = parseXPaymentHeader(value);
  if (!parsed) {
    return { parsed: false, headerLength: value.length };
  }

  const envelopePayload =
    parsed.paymentPayload && typeof parsed.paymentPayload === "object"
      ? (parsed.paymentPayload as Record<string, unknown>)
      : undefined;
  const payload = envelopePayload ?? parsed;
  const nestedPayload =
    payload.payload && typeof payload.payload === "object"
      ? (payload.payload as Record<string, unknown>)
      : undefined;
  const requirements =
    parsed.paymentRequirements && typeof parsed.paymentRequirements === "object"
      ? (parsed.paymentRequirements as Record<string, unknown>)
      : undefined;
  const authorization =
    (payload.authorization && typeof payload.authorization === "object"
      ? (payload.authorization as Record<string, unknown>)
      : undefined) ??
    (nestedPayload?.authorization && typeof nestedPayload.authorization === "object"
      ? (nestedPayload.authorization as Record<string, unknown>)
      : undefined);

  return {
    parsed: true,
    headerLength: value.length,
    scheme: readString(payload, "scheme") ?? readString(parsed, "scheme"),
    network: readString(payload, "network") ?? readString(parsed, "network"),
    hasPayload: Boolean(payload),
    hasAuthorization: Boolean(authorization),
    paymentRequestId:
      readString(payload, "paymentRequestId") ??
      readString(parsed, "paymentRequestId") ??
      readString(requirements ?? {}, "paymentRequestId"),
    payer: maskAddress(readString(authorization ?? {}, "from") ?? readString(authorization ?? {}, "payer")),
    payee: maskAddress(readString(authorization ?? {}, "to") ?? readString(authorization ?? {}, "payee")),
    amount: readString(authorization ?? {}, "value") ?? readString(authorization ?? {}, "amount"),
    sessionId: maskAddress(readString(payload, "sessionId") ?? readString(nestedPayload ?? {}, "sessionId"))
  };
}

function buildFacilitatorRequirements(input: {
  paymentRequestId: string;
  amountAtomic: string;
  amountUsd: string;
  pair: string;
  deps: OraclePaymentDeps;
}): Record<string, unknown> {
  const scheme = normalizePaymentScheme(input.deps.paymentScheme);
  const network = normalizePaymentNetwork(input.deps.network);
  return {
    x402Version: DEFAULT_X402_VERSION,
    scheme,
    network,
    asset: input.deps.paymentAssetAddress,
    payTo: input.deps.payToAddress,
    maxAmountRequired: input.amountAtomic,
    maxTimeoutSeconds: 120,
    accepts: [
      {
        x402Version: DEFAULT_X402_VERSION,
        scheme,
        network,
        maxAmountRequired: input.amountAtomic,
        resource: DEFAULT_SERVICE_URL,
        description: "Synoptic Oracle Price API",
        payTo: input.deps.payToAddress,
        asset: input.deps.paymentAssetAddress,
        merchantName: "Synoptic Oracle"
      }
    ],
    paymentRequestId: input.paymentRequestId,
    amountUsd: input.amountUsd,
    pair: input.pair
  };
}

function normalizePaymentRequirements(
  source: Record<string, unknown>,
  fallback: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...source };
  const fallbackScheme = normalizePaymentScheme(
    readString(fallback, "scheme") ?? DEFAULT_PAYMENT_SCHEME
  );
  const fallbackNetwork = normalizePaymentNetwork(
    readString(fallback, "network") ?? DEFAULT_PAYMENT_NETWORK
  );

  const sourceAccepts = Array.isArray(source.accepts)
    ? (source.accepts as unknown[])
    : [];
  const normalizedAccepts = sourceAccepts.map((entry) => {
    if (!entry || typeof entry !== "object") return entry as unknown;
    const item = { ...(entry as Record<string, unknown>) };
    const scheme = fallbackScheme;
    const network = fallbackNetwork;
    item.scheme = scheme;
    item.network = network;
    if (!readString(item, "maxAmountRequired")) {
      item.maxAmountRequired = readString(fallback, "maxAmountRequired");
    }
    if (!readString(item, "asset")) {
      item.asset = readString(fallback, "asset");
    }
    if (!readString(item, "payTo")) {
      item.payTo = readString(fallback, "payTo");
    }
    item.x402Version = DEFAULT_X402_VERSION;
    return item;
  });

  const scheme = fallbackScheme;
  const network = fallbackNetwork;
  out.scheme = scheme;
  out.network = network;
  out.x402Version = DEFAULT_X402_VERSION;
  if (!readString(out, "maxAmountRequired")) {
    out.maxAmountRequired = readString(fallback, "maxAmountRequired");
  }
  if (!readString(out, "asset")) {
    out.asset = readString(fallback, "asset");
  }
  if (!readString(out, "payTo")) {
    out.payTo = readString(fallback, "payTo");
  }
  out.accepts = normalizedAccepts.length > 0 ? normalizedAccepts : fallback.accepts;
  return out;
}

function normalizePaymentPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...payload };

  // Kite MCP often nests authorization/signature under `payload`.
  const nested =
    out.payload && typeof out.payload === "object"
      ? (out.payload as Record<string, unknown>)
      : undefined;
  if (nested) {
    if (out.authorization === undefined && nested.authorization !== undefined) {
      out.authorization = nested.authorization;
    }
    if (out.signature === undefined && nested.signature !== undefined) {
      out.signature = nested.signature;
    }
  }

  const schemeRaw = readString(out, "scheme");
  if (schemeRaw) out.scheme = normalizePaymentScheme(schemeRaw);
  const networkRaw = readString(out, "network");
  if (networkRaw) out.network = normalizePaymentNetwork(networkRaw);
  if (typeof out.x402Version !== "number") out.x402Version = DEFAULT_X402_VERSION;

  return out;
}

function prepareFacilitatorXPayment(
  paymentHeader: string,
  fallbackRequirements: Record<string, unknown>
): string {
  const parsed = parseXPaymentHeader(paymentHeader);
  if (!parsed) return paymentHeader;

  const hasEnvelope =
    parsed.paymentPayload !== undefined || parsed.paymentRequirements !== undefined;

  const payloadRaw = hasEnvelope
    ? parsed.paymentPayload
    : parsed;
  const paymentPayload =
    payloadRaw && typeof payloadRaw === "object"
      ? normalizePaymentPayload(payloadRaw as Record<string, unknown>)
      : normalizePaymentPayload({});

  const requirementsRaw =
    hasEnvelope && parsed.paymentRequirements && typeof parsed.paymentRequirements === "object"
      ? (parsed.paymentRequirements as Record<string, unknown>)
      : {};
  const paymentRequirements = normalizePaymentRequirements(requirementsRaw, fallbackRequirements);
  if (!readString(paymentPayload, "scheme")) {
    paymentPayload.scheme = readString(paymentRequirements, "scheme") ?? DEFAULT_PAYMENT_SCHEME;
  }
  if (!readString(paymentPayload, "network")) {
    paymentPayload.network = readString(paymentRequirements, "network") ?? DEFAULT_PAYMENT_NETWORK;
  }
  if (typeof paymentPayload.x402Version !== "number") {
    paymentPayload.x402Version = DEFAULT_X402_VERSION;
  }

  return JSON.stringify({
    paymentPayload,
    paymentRequirements
  });
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
  input: { requestId: string; amountUsd: number; amountAtomic: string; pair: string },
  deps: OraclePaymentDeps
) {
  const scheme = normalizePaymentScheme(deps.paymentScheme);
  const network = normalizePaymentNetwork(deps.network);
  const challenge = {
    x402Version: DEFAULT_X402_VERSION,
    scheme,
    network,
    asset: deps.paymentAssetAddress,
    payTo: deps.payToAddress,
    maxAmountRequired: input.amountAtomic,
    maxTimeoutSeconds: 120,
    accepts: [
      {
        x402Version: DEFAULT_X402_VERSION,
        scheme,
        network,
        maxAmountRequired: input.amountAtomic,
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
  const paymentAmountAtomic = toAtomicAmount(paymentUsd, deps.paymentAssetDecimals);
  const pair = ((request.query as { pair?: string } | undefined)?.pair ?? "ETH/USDT").toUpperCase();
  const payment = request.headers["x-payment"];
  if (typeof payment !== "string" || payment.length === 0) {
    const created = await deps.store.createPayment({
      agentId,
      direction: "outgoing",
      amountWei: paymentAmountAtomic,
      amountUsd: paymentUsd.toFixed(2),
      tokenAddress: deps.paymentAssetAddress,
      serviceUrl: DEFAULT_SERVICE_URL,
      status: "requested"
    });
    const challenge = buildChallenge(
      {
        requestId: created.id,
        amountUsd: paymentUsd,
        amountAtomic: paymentAmountAtomic,
        pair
      },
      deps
    );
    await deps.store.updatePaymentStatus(created.id, "requested", {
      facilitatorResponse: {
        stage: "challenge_issued",
        amountUsd: paymentUsd.toFixed(2),
        amountAtomic: paymentAmountAtomic,
        payTo: deps.payToAddress,
        asset: deps.paymentAssetAddress
      }
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
      amountWei: paymentAmountAtomic,
      amountUsd: paymentUsd.toFixed(2),
      tokenAddress: deps.paymentAssetAddress,
      serviceUrl: DEFAULT_SERVICE_URL,
      status: "requested"
    }));

  const facilitatorRequirements = buildFacilitatorRequirements({
    paymentRequestId: candidate.id,
    amountAtomic: paymentAmountAtomic,
    amountUsd: paymentUsd.toFixed(2),
    pair,
    deps
  });
  const preparedPayment = prepareFacilitatorXPayment(payment, facilitatorRequirements);

  request.log.info(
    {
      paymentRequestId: candidate.id,
      headerPaymentRequestId: paymentRecordId,
      paymentAmountAtomic,
      paymentAmountUsd: paymentUsd.toFixed(2),
      asset: deps.paymentAssetAddress,
      payTo: deps.payToAddress,
      xPayment: summarizeXPayment(payment),
      facilitatorXPayment: summarizeXPayment(preparedPayment)
    },
    "x402 verify attempt"
  );

  const authorized = await deps.paymentAdapter.verify(preparedPayment);
  if (!authorized.authorized) {
    const reason = authorized.reason ?? "unauthorized";
    request.log.warn(
      {
        paymentRequestId: candidate.id,
        headerPaymentRequestId: paymentRecordId,
        reason,
        xPayment: summarizeXPayment(payment),
        facilitatorXPayment: summarizeXPayment(preparedPayment)
      },
      "x402 verify rejected"
    );
    const failed = await deps.store.updatePaymentStatus(candidate.id, "failed", {
      facilitatorResponse: {
        stage: "verify",
        reason,
        paymentRequestId: candidate.id,
        headerPaymentRequestId: paymentRecordId
      }
    });
    if (failed) deps.onPayment?.(failed);
    await emitActivity(deps, {
      agentId,
      eventType: "payment.failed",
      paymentId: candidate.id,
      data: { stage: "verify", reason }
    });
    reply.status(402).send({
      code: "PAYMENT_VERIFY_FAILED",
      message: "Payment verification failed",
      reason,
      paymentRequestId: candidate.id
    });
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

  const result = await deps.paymentAdapter.settle(preparedPayment);
  if (!result.settled) {
    const reason = result.reason ?? "settlement_failed";
    request.log.warn(
      {
        paymentRequestId: candidate.id,
        reason,
        xPayment: summarizeXPayment(payment),
        facilitatorXPayment: summarizeXPayment(preparedPayment)
      },
      "x402 settle rejected"
    );
    const failed = await deps.store.updatePaymentStatus(candidate.id, "failed", {
      facilitatorResponse: { stage: "settle", reason }
    });
    if (failed) deps.onPayment?.(failed);
    await emitActivity(deps, {
      agentId,
      eventType: "payment.failed",
      paymentId: candidate.id,
      data: { stage: "settle", reason }
    });
    reply.status(402).send({
      code: "PAYMENT_SETTLE_FAILED",
      message: "Payment settlement failed",
      reason,
      paymentRequestId: candidate.id
    });
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
