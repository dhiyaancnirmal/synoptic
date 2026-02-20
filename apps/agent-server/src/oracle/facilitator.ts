import type { PaymentAdapter } from "@synoptic/agent-core";

interface RealFacilitatorAdapterOptions {
  baseUrl: string;
  network: string;
  fetchImpl?: typeof fetch;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function maybeJson(value: string): Record<string, unknown> | undefined {
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

function parseXPaymentPayload(xPayment: string): Record<string, unknown> | undefined {
  const raw = xPayment.trim();
  if (raw.length === 0) return undefined;

  const direct = maybeJson(raw);
  if (direct) return direct;

  const base64Decoded = decodeBase64(raw);
  if (base64Decoded) {
    const parsed = maybeJson(base64Decoded);
    if (parsed) return parsed;
  }

  const base64UrlDecoded = decodeBase64Url(raw);
  if (base64UrlDecoded) {
    const parsed = maybeJson(base64UrlDecoded);
    if (parsed) return parsed;
  }

  return undefined;
}

function readBool(obj: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

function readString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

async function parseResponse(response: Response): Promise<Record<string, unknown>> {
  const json = (await response.json().catch(() => ({}))) as unknown;
  if (!json || typeof json !== "object") return {};
  return json as Record<string, unknown>;
}

export class RealFacilitatorPaymentAdapter implements PaymentAdapter {
  private readonly baseUrl: string;
  private readonly network: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: RealFacilitatorAdapterOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.network = options.network;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async verify(paymentToken: string): Promise<{ authorized: boolean; reason?: string }> {
    const parsed = parseXPaymentPayload(paymentToken);
    if (!parsed) {
      return { authorized: false, reason: "invalid_x_payment_payload" };
    }

    const payload = {
      ...parsed,
      network: readString(parsed, ["network"]) ?? this.network
    };
    const response = await this.fetchImpl(`${this.baseUrl}/v2/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await parseResponse(response);
    if (!response.ok) {
      return {
        authorized: false,
        reason: readString(body, ["message", "error", "code"]) ?? `verify_http_${response.status}`
      };
    }

    const explicit = readBool(body, ["valid", "verified", "authorized", "success"]);
    if (explicit === false) {
      return { authorized: false, reason: readString(body, ["message", "error", "code"]) ?? "verify_rejected" };
    }

    return { authorized: true };
  }

  async settle(paymentToken: string): Promise<{ settled: boolean; txHash?: string; reason?: string }> {
    const parsed = parseXPaymentPayload(paymentToken);
    if (!parsed) {
      return { settled: false, reason: "invalid_x_payment_payload" };
    }

    const payload = {
      ...parsed,
      network: readString(parsed, ["network"]) ?? this.network
    };
    const response = await this.fetchImpl(`${this.baseUrl}/v2/settle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await parseResponse(response);
    if (!response.ok) {
      return {
        settled: false,
        reason: readString(body, ["message", "error", "code"]) ?? `settle_http_${response.status}`
      };
    }

    const explicit = readBool(body, ["settled", "success"]);
    if (explicit === false) {
      return { settled: false, reason: readString(body, ["message", "error", "code"]) ?? "settle_rejected" };
    }

    return {
      settled: true,
      txHash: readString(body, ["txHash", "transactionHash", "settlementTxHash"])
    };
  }
}
