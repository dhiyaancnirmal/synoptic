import type { PaymentAdapter } from "@synoptic/agent-core";

function tryParseJson(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    return undefined;
  } catch {
    return undefined;
  }
}

function tryDecodeBase64(value: string): string | undefined {
  try {
    return Buffer.from(value, "base64").toString("utf-8");
  } catch {
    return undefined;
  }
}

function parsePayload(raw: string): Record<string, unknown> | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const direct = tryParseJson(trimmed);
  if (direct) return direct;
  const decoded = tryDecodeBase64(trimmed);
  if (decoded) return tryParseJson(decoded);
  return undefined;
}

export class DemoPaymentAdapter implements PaymentAdapter {
  async verify(paymentToken: string): Promise<{ authorized: boolean; reason?: string }> {
    const parsed = parsePayload(paymentToken);
    if (!parsed) {
      return { authorized: false, reason: "demo_invalid_payload" };
    }

    const hasPaymentPayload =
      parsed.paymentPayload !== undefined || parsed.authorization !== undefined || parsed.signature !== undefined;
    const hasRequirements =
      parsed.paymentRequirements !== undefined || parsed.scheme !== undefined;

    if (!hasPaymentPayload && !hasRequirements) {
      return { authorized: false, reason: "demo_missing_payment_fields" };
    }

    console.log("[demo-facilitator] verify: authorized (demo mode)");
    return { authorized: true };
  }

  async settle(paymentToken: string): Promise<{ settled: boolean; txHash?: string; reason?: string }> {
    const parsed = parsePayload(paymentToken);
    if (!parsed) {
      return { settled: false, reason: "demo_invalid_payload" };
    }

    const requestId =
      (parsed.paymentRequirements as Record<string, unknown> | undefined)?.paymentRequestId ??
      parsed.paymentRequestId ??
      "unknown";

    const txHash = `0xdemo_${String(requestId).slice(0, 16)}_${Date.now().toString(16)}`;
    console.log(`[demo-facilitator] settle: txHash=${txHash} (demo mode)`);
    return { settled: true, txHash };
  }
}
