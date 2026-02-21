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
    const verifyProbe = await this.probe(async () => {
      await this.adapter.verify(PROBE_TOKEN);
    });
    const settleProbe = await this.probe(async () => {
      await this.adapter.settle(PROBE_TOKEN);
    });

    const verifyReachable: PaymentCapabilityStatus["verifyReachable"] =
      verifyProbe.ok ? "up" : "down";
    const settleReachable: PaymentCapabilityStatus["settleReachable"] =
      settleProbe.ok ? "up" : "down";
    let lastError: string | undefined;
    if (!verifyProbe.ok) {
      lastError = verifyProbe.error;
    } else if (!settleProbe.ok) {
      lastError = settleProbe.error;
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

  private async probe(
    fn: () => Promise<void>
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      await fn();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
