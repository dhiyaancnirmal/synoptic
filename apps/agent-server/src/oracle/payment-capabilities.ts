import type { PaymentAdapter } from "@synoptic/agent-core";
import type { AgentServerEnv } from "../env.js";
import { DemoPaymentAdapter } from "./demo-facilitator.js";
import { RealFacilitatorPaymentAdapter } from "./facilitator.js";

export interface PaymentCapabilityStatus {
  mode: "facilitator" | "demo";
  configured: boolean;
  verifyReachable: "up" | "down" | "unknown";
  settleReachable: "up" | "down" | "unknown";
  lastCheckedAt?: string;
  latencyMs?: number;
  lastError?: string;
}

interface ProbeEndpointResult {
  reachable: "up" | "down";
  latencyMs: number;
  error?: string;
}

function ensureFacilitatorModeConfigured(env: AgentServerEnv): void {
  if (env.kitePaymentMode !== "facilitator") return;
  if (!env.kiteFacilitatorUrl || env.kiteFacilitatorUrl.trim().length === 0) {
    throw new Error(
      "KITE_PAYMENT_MODE=facilitator requires KITE_FACILITATOR_URL to be configured."
    );
  }
}

export function createPaymentAdapter(env: AgentServerEnv): PaymentAdapter {
  ensureFacilitatorModeConfigured(env);

  if (env.kitePaymentMode === "demo") {
    return new DemoPaymentAdapter();
  }

  return new RealFacilitatorPaymentAdapter({
    baseUrl: env.kiteFacilitatorUrl,
    network: env.kiteNetwork
  });
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

async function probeEndpoint(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number
): Promise<ProbeEndpointResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scheme: "gokite-aa",
        network: "kite-testnet",
        x402Version: 1
      }),
      signal: controller.signal
    });
    const latencyMs = Date.now() - start;
    clearTimeout(timer);
    if (response.status >= 100 && response.status < 600) {
      return { reachable: "up", latencyMs };
    }
    return {
      reachable: "down",
      latencyMs,
      error: `unexpected_status_${response.status}`
    };
  } catch (error) {
    clearTimeout(timer);
    return {
      reachable: "down",
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export class PaymentCapabilityProbe {
  private cached: PaymentCapabilityStatus = {
    mode: "facilitator",
    configured: false,
    verifyReachable: "unknown",
    settleReachable: "unknown"
  };
  private lastChecked = 0;

  constructor(
    private readonly env: AgentServerEnv,
    private readonly options: {
      cacheTtlMs?: number;
      timeoutMs?: number;
      fetchImpl?: typeof fetch;
    } = {}
  ) {
    this.cached.mode = env.kitePaymentMode;
    this.cached.configured =
      env.kitePaymentMode === "demo" || Boolean(env.kiteFacilitatorUrl);
  }

  async getStatus(force = false): Promise<PaymentCapabilityStatus> {
    const ttl = this.options.cacheTtlMs ?? 60_000;
    const now = Date.now();
    if (!force && now - this.lastChecked < ttl && this.cached.lastCheckedAt) {
      return this.cached;
    }
    return this.refresh();
  }

  async refresh(): Promise<PaymentCapabilityStatus> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const timeoutMs = this.options.timeoutMs ?? 5_000;
    this.lastChecked = Date.now();

    if (this.env.kitePaymentMode === "demo") {
      this.cached = {
        mode: "demo",
        configured: true,
        verifyReachable: "up",
        settleReachable: "up",
        latencyMs: 0,
        lastCheckedAt: new Date().toISOString()
      };
      return this.cached;
    }

    if (!this.env.kiteFacilitatorUrl || this.env.kiteFacilitatorUrl.trim().length === 0) {
      this.cached = {
        mode: "facilitator",
        configured: false,
        verifyReachable: "down",
        settleReachable: "down",
        lastError: "missing_kite_facilitator_url",
        lastCheckedAt: new Date().toISOString()
      };
      return this.cached;
    }

    const baseUrl = normalizeBaseUrl(this.env.kiteFacilitatorUrl);
    const verify = await probeEndpoint(fetchImpl, `${baseUrl}/v2/verify`, timeoutMs);
    const settle = await probeEndpoint(fetchImpl, `${baseUrl}/v2/settle`, timeoutMs);

    const errors: string[] = [];
    if (verify.error) errors.push(`verify:${verify.error}`);
    if (settle.error) errors.push(`settle:${settle.error}`);

    this.cached = {
      mode: "facilitator",
      configured: true,
      verifyReachable: verify.reachable,
      settleReachable: settle.reachable,
      latencyMs: verify.latencyMs + settle.latencyMs,
      lastCheckedAt: new Date().toISOString(),
      ...(errors.length > 0 ? { lastError: errors.join(" | ") } : {})
    };

    return this.cached;
  }
}
