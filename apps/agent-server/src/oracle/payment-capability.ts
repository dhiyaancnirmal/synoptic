import type { PaymentAdapter } from "@synoptic/agent-core";

export interface PaymentCapabilityStatus {
  mode: "facilitator" | "demo";
  configured: boolean;
  verifyReachable: "up" | "down" | "unknown";
  settleReachable: "up" | "down" | "unknown";
  lastCheckedAt?: string;
  latencyMs?: number;
  lastError?: string;
}

const PROBE_TOKEN = JSON.stringify({
  x402Version: 1,
  scheme: "gokite-aa",
  network: "kite-testnet",
  paymentPayload: {
    network: "kite-testnet",
    payload: {
      authorization: {
        from: "0x0000000000000000000000000000000000000001",
        to: "0x0000000000000000000000000000000000000002",
        value: "1"
      },
      signature: "0x"
    }
  },
  paymentRequirements: {
    x402Version: 1,
    scheme: "gokite-aa",
    network: "kite-testnet",
    payTo: "0x0000000000000000000000000000000000000002",
    asset: "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63",
    maxAmountRequired: "1",
    paymentRequestId: "probe"
  }
});

export class PaymentCapabilityProbe {
  private cached?: PaymentCapabilityStatus;
  private expiresAt = 0;

  constructor(
    private readonly adapter: PaymentAdapter,
    private readonly mode: "facilitator" | "demo",
    private readonly configured: boolean,
    private readonly ttlMs = 60_000
  ) {}

  async getStatus(): Promise<PaymentCapabilityStatus> {
    if (this.cached && Date.now() < this.expiresAt) {
      return this.cached;
    }
    const startedAt = Date.now();
    let verifyReachable: PaymentCapabilityStatus["verifyReachable"] = "unknown";
    let settleReachable: PaymentCapabilityStatus["settleReachable"] = "unknown";
    let lastError: string | undefined;

    try {
      await this.adapter.verify(PROBE_TOKEN);
      verifyReachable = "up";
    } catch (error) {
      verifyReachable = "down";
      lastError = error instanceof Error ? error.message : String(error);
    }

    try {
      await this.adapter.settle(PROBE_TOKEN);
      settleReachable = "up";
    } catch (error) {
      settleReachable = "down";
      lastError = error instanceof Error ? error.message : String(error);
    }

    this.cached = {
      mode: this.mode,
      configured: this.configured,
      verifyReachable,
      settleReachable,
      lastCheckedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      lastError
    };
    this.expiresAt = Date.now() + this.ttlMs;
    return this.cached;
  }
}

