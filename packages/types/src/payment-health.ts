export interface PaymentHealthStatus {
  mode: "facilitator" | "demo";
  configured: boolean;
  verifyReachable: "up" | "down" | "unknown";
  settleReachable: "up" | "down" | "unknown";
  lastCheckedAt?: string;
  latencyMs?: number;
  lastError?: string;
}

