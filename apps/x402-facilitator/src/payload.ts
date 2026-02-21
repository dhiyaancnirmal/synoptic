import type { FacilitatorEnv } from "./env.js";
import type { NormalizedPaymentRequest, PaymentAuthorization } from "./types.js";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const BYTES32_RE = /^0x[a-fA-F0-9]{64}$/;
const HEX_BYTES_RE = /^0x(?:[a-fA-F0-9]{2})*$/;
const SIGNATURE_RE = /^0x[a-fA-F0-9]{130}$/;
const UINT_RE = /^[0-9]+$/;

export class PaymentValidationError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(input: {
    status?: number;
    code: string;
    message: string;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.status = input.status ?? 400;
    this.code = input.code;
    this.details = input.details;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  return value as Record<string, unknown>;
}

function readString(value: Record<string, unknown>, key: string): string | undefined {
  const raw = value[key];
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

function readNumber(value: Record<string, unknown>, key: string): number | undefined {
  const raw = value[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

function parseJson(raw: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return asRecord(parsed);
  } catch {
    return undefined;
  }
}

function decodeBase64(raw: string): string | undefined {
  try {
    return Buffer.from(raw, "base64").toString("utf-8");
  } catch {
    return undefined;
  }
}

function decodeBase64Url(raw: string): string | undefined {
  try {
    const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    return Buffer.from(padded, "base64").toString("utf-8");
  } catch {
    return undefined;
  }
}

function parseXPaymentToken(raw: string): Record<string, unknown> | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const direct = parseJson(trimmed);
  if (direct) return direct;

  const fromBase64 = decodeBase64(trimmed);
  if (fromBase64) {
    const parsed = parseJson(fromBase64);
    if (parsed) return parsed;
  }

  const fromBase64Url = decodeBase64Url(trimmed);
  if (fromBase64Url) {
    const parsed = parseJson(fromBase64Url);
    if (parsed) return parsed;
  }

  return undefined;
}

function normalizeAuthorization(payload: Record<string, unknown>): PaymentAuthorization {
  const nestedPayload = asRecord(payload.payload);
  const authorization =
    asRecord(payload.authorization) ??
    (nestedPayload ? asRecord(nestedPayload.authorization) : undefined);
  if (!authorization) {
    throw new PaymentValidationError({
      code: "missing_authorization",
      message: "Missing authorization payload"
    });
  }

  const from = readString(authorization, "from");
  const to = readString(authorization, "to");
  const token = readString(authorization, "token");
  const value = readString(authorization, "value");
  const validAfter = readString(authorization, "validAfter");
  const validBefore = readString(authorization, "validBefore");
  const nonce = readString(authorization, "nonce");

  const missing = {
    from,
    to,
    token,
    value,
    validAfter,
    validBefore,
    nonce
  };
  const missingKeys = Object.entries(missing)
    .filter(([, entry]) => !entry)
    .map(([key]) => key);
  if (missingKeys.length > 0) {
    throw new PaymentValidationError({
      code: "invalid_authorization_fields",
      message: "Authorization is missing required fields",
      details: { missing: missingKeys }
    });
  }

  if (!ADDRESS_RE.test(from!)) {
    throw new PaymentValidationError({
      code: "invalid_authorization_from",
      message: "authorization.from must be a valid EVM address"
    });
  }
  if (!ADDRESS_RE.test(to!)) {
    throw new PaymentValidationError({
      code: "invalid_authorization_to",
      message: "authorization.to must be a valid EVM address"
    });
  }
  if (!ADDRESS_RE.test(token!)) {
    throw new PaymentValidationError({
      code: "invalid_authorization_token",
      message: "authorization.token must be a valid token address"
    });
  }
  if (!UINT_RE.test(value!)) {
    throw new PaymentValidationError({
      code: "invalid_authorization_value",
      message: "authorization.value must be an atomic integer string"
    });
  }
  if (!UINT_RE.test(validAfter!)) {
    throw new PaymentValidationError({
      code: "invalid_authorization_valid_after",
      message: "authorization.validAfter must be an integer string"
    });
  }
  if (!UINT_RE.test(validBefore!)) {
    throw new PaymentValidationError({
      code: "invalid_authorization_valid_before",
      message: "authorization.validBefore must be an integer string"
    });
  }
  if (!BYTES32_RE.test(nonce!)) {
    throw new PaymentValidationError({
      code: "invalid_authorization_nonce",
      message: "authorization.nonce must be a 32-byte hex string"
    });
  }

  return {
    from: from!,
    to: to!,
    token: token!,
    value: value!,
    validAfter: validAfter!,
    validBefore: validBefore!,
    nonce: nonce!
  };
}

function normalizeSessionAndMetadata(paymentPayload: Record<string, unknown>): {
  sessionId: string;
  metadata: string;
  metadataBytes: string;
} {
  const nestedPayload = asRecord(paymentPayload.payload);
  const nested = nestedPayload ?? {};
  const sessionId = readString(paymentPayload, "sessionId") ?? readString(nested, "sessionId");
  if (!sessionId) {
    throw new PaymentValidationError({
      code: "missing_session_id",
      message: "Missing payment sessionId"
    });
  }
  if (!BYTES32_RE.test(sessionId)) {
    throw new PaymentValidationError({
      code: "invalid_session_id",
      message: "sessionId must be a 32-byte hex string"
    });
  }

  const rawMetadata = paymentPayload.metadata ?? nested.metadata;
  if (rawMetadata !== undefined && typeof rawMetadata !== "string") {
    throw new PaymentValidationError({
      code: "invalid_metadata",
      message: "metadata must be a string"
    });
  }

  const metadata = typeof rawMetadata === "string" && rawMetadata.length > 0 ? rawMetadata : "0x";
  const metadataBytes = HEX_BYTES_RE.test(metadata)
    ? metadata
    : `0x${Buffer.from(metadata, "utf-8").toString("hex")}`;

  return { sessionId, metadata, metadataBytes };
}

function normalizeTuple(
  paymentPayload: Record<string, unknown>,
  paymentRequirements: Record<string, unknown>,
  env: FacilitatorEnv
): { scheme: string; network: string; x402Version: number } {
  const scheme = readString(paymentPayload, "scheme") ?? readString(paymentRequirements, "scheme");
  const network = readString(paymentPayload, "network") ?? readString(paymentRequirements, "network");
  const x402Version =
    readNumber(paymentPayload, "x402Version") ??
    readNumber(paymentRequirements, "x402Version") ??
    1;

  if ((scheme ?? env.canonicalScheme) !== env.canonicalScheme) {
    throw new PaymentValidationError({
      code: "tuple_mismatch_scheme",
      message: `Unsupported scheme: expected ${env.canonicalScheme}`,
      details: { received: scheme ?? null, expected: env.canonicalScheme }
    });
  }
  if ((network ?? env.canonicalNetwork) !== env.canonicalNetwork) {
    throw new PaymentValidationError({
      code: "tuple_mismatch_network",
      message: `Unsupported network: expected ${env.canonicalNetwork}`,
      details: { received: network ?? null, expected: env.canonicalNetwork }
    });
  }
  if (x402Version !== 1) {
    throw new PaymentValidationError({
      code: "tuple_mismatch_version",
      message: "Unsupported x402Version: expected 1",
      details: { received: x402Version, expected: 1 }
    });
  }

  return {
    scheme: env.canonicalScheme,
    network: env.canonicalNetwork,
    x402Version: 1
  };
}

function buildRequirements(
  input: {
    paymentRequirements: Record<string, unknown>;
    authorization: PaymentAuthorization;
    tuple: { scheme: string; network: string; x402Version: number };
  }
): { requirements: Record<string, unknown>; asset: string; payTo: string; maxAmountRequired: string } {
  const req = input.paymentRequirements;
  const asset = readString(req, "asset") ?? input.authorization.token;
  const payTo = readString(req, "payTo") ?? input.authorization.to;
  const maxAmountRequired = readString(req, "maxAmountRequired") ?? input.authorization.value;

  if (!ADDRESS_RE.test(asset)) {
    throw new PaymentValidationError({
      code: "invalid_requirement_asset",
      message: "paymentRequirements.asset must be a valid token address"
    });
  }
  if (!ADDRESS_RE.test(payTo)) {
    throw new PaymentValidationError({
      code: "invalid_requirement_pay_to",
      message: "paymentRequirements.payTo must be a valid recipient address"
    });
  }
  if (!UINT_RE.test(maxAmountRequired)) {
    throw new PaymentValidationError({
      code: "invalid_requirement_max_amount",
      message: "paymentRequirements.maxAmountRequired must be an atomic integer string"
    });
  }

  if (asset.toLowerCase() !== input.authorization.token.toLowerCase()) {
    throw new PaymentValidationError({
      code: "requirement_asset_mismatch",
      message: "paymentRequirements.asset does not match authorization.token",
      details: { requirementAsset: asset, authorizationToken: input.authorization.token }
    });
  }
  if (payTo.toLowerCase() !== input.authorization.to.toLowerCase()) {
    throw new PaymentValidationError({
      code: "requirement_pay_to_mismatch",
      message: "paymentRequirements.payTo does not match authorization.to",
      details: { requirementPayTo: payTo, authorizationTo: input.authorization.to }
    });
  }

  const requested = BigInt(input.authorization.value);
  const allowed = BigInt(maxAmountRequired);
  if (requested > allowed) {
    throw new PaymentValidationError({
      code: "requirement_amount_exceeded",
      message: "authorization.value exceeds paymentRequirements.maxAmountRequired",
      details: { value: input.authorization.value, maxAmountRequired }
    });
  }

  const accepts = Array.isArray(req.accepts)
    ? req.accepts
    : [
        {
          scheme: input.tuple.scheme,
          network: input.tuple.network,
          x402Version: input.tuple.x402Version,
          asset,
          payTo,
          maxAmountRequired
        }
      ];

  return {
    requirements: {
      ...req,
      scheme: input.tuple.scheme,
      network: input.tuple.network,
      x402Version: input.tuple.x402Version,
      asset,
      payTo,
      maxAmountRequired,
      accepts
    },
    asset,
    payTo,
    maxAmountRequired
  };
}

function extractEnvelope(body: unknown): { paymentPayload: Record<string, unknown>; paymentRequirements: Record<string, unknown> } {
  if (typeof body === "string") {
    const parsed = parseXPaymentToken(body);
    if (!parsed) {
      throw new PaymentValidationError({
        code: "invalid_x_payment",
        message: "Body string is not parseable x-payment JSON/base64/base64url"
      });
    }
    return { paymentPayload: parsed, paymentRequirements: {} };
  }

  const record = asRecord(body);
  if (!record) {
    throw new PaymentValidationError({
      code: "invalid_request_body",
      message: "Request body must be a JSON object"
    });
  }

  const xPaymentRaw = readString(record, "xPayment") ?? readString(record, "x_payment");
  if (xPaymentRaw) {
    const parsed = parseXPaymentToken(xPaymentRaw);
    if (!parsed) {
      throw new PaymentValidationError({
        code: "invalid_x_payment",
        message: "xPayment is not parseable JSON/base64/base64url"
      });
    }
    return {
      paymentPayload: parsed,
      paymentRequirements: asRecord(record.paymentRequirements) ?? {}
    };
  }

  if (record.paymentPayload !== undefined || record.paymentRequirements !== undefined) {
    return {
      paymentPayload: asRecord(record.paymentPayload) ?? {},
      paymentRequirements: asRecord(record.paymentRequirements) ?? {}
    };
  }

  return {
    paymentPayload: record,
    paymentRequirements: asRecord(record.paymentRequirements) ?? {}
  };
}

export function normalizePaymentRequest(body: unknown, env: FacilitatorEnv): NormalizedPaymentRequest {
  const { paymentPayload, paymentRequirements } = extractEnvelope(body);
  const authorization = normalizeAuthorization(paymentPayload);
  const session = normalizeSessionAndMetadata(paymentPayload);
  const signature =
    readString(paymentPayload, "signature") ??
    readString(asRecord(paymentPayload.payload) ?? {}, "signature");

  if (!signature) {
    throw new PaymentValidationError({
      code: "missing_signature",
      message: "Missing payment signature"
    });
  }
  if (!SIGNATURE_RE.test(signature)) {
    throw new PaymentValidationError({
      code: "invalid_signature",
      message: "signature must be a 65-byte hex string"
    });
  }

  const tuple = normalizeTuple(paymentPayload, paymentRequirements, env);
  const requirementInfo = buildRequirements({
    paymentRequirements,
    authorization,
    tuple
  });

  const paymentRequestId =
    readString(paymentPayload, "paymentRequestId") ??
    readString(paymentRequirements, "paymentRequestId");

  return {
    paymentPayload: {
      ...paymentPayload,
      scheme: tuple.scheme,
      network: tuple.network,
      x402Version: tuple.x402Version,
      authorization,
      signature,
      sessionId: session.sessionId,
      metadata: session.metadata,
      paymentRequestId
    },
    paymentRequirements: {
      ...requirementInfo.requirements,
      paymentRequestId
    },
    authorization,
    signature,
    sessionId: session.sessionId,
    metadata: session.metadata,
    metadataBytes: session.metadataBytes,
    paymentRequestId,
    scheme: tuple.scheme,
    network: tuple.network,
    x402Version: tuple.x402Version,
    asset: requirementInfo.asset,
    payTo: requirementInfo.payTo,
    maxAmountRequired: requirementInfo.maxAmountRequired
  };
}
