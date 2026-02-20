import type { ActivityChain, ActivityEvent, Agent, AgentStatus, Payment, Trade, TradeStatus } from "@/lib/shared-types";

export type ConnectionStatus = "connected" | "reconnecting" | "polling-fallback" | "offline";

export interface AgentVM {
  id: string;
  name: string;
  role: string;
  status: AgentStatus | "unknown";
  ownerAddress: string;
  eoaAddress: string;
  dailyBudgetUsd: string;
  spentTodayUsd: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentVM {
  id: string;
  agentId: string;
  status: "requested" | "authorized" | "settled" | "failed";
  amountUsd: string;
  serviceUrl: string;
  txHash?: string;
  createdAt: string;
  settledAt?: string;
  settlementId?: string;
}

export interface TradeVM {
  id: string;
  agentId: string;
  status: TradeStatus;
  pair: string;
  amountIn: string;
  amountOut: string;
  chainId?: number;
  executionChain: ActivityChain;
  executionTxHash?: string;
  /**
   * @deprecated Use executionTxHash.
   */
  sepoliaTxHash?: string;
  kiteAttestationTx?: string;
  strategyReason?: string;
  createdAt: string;
  confirmedAt?: string;
  stage: TradeStatus;
}

export interface ActivityVM {
  id: string;
  agentId: string;
  eventType: string;
  chain: ActivityChain;
  txHash?: string;
  createdAt: string;
  detail: string;
  paymentId?: string;
  tradeId?: string;
}

export function mapAgent(input: unknown): AgentVM {
  const raw = asRecord(input);
  const canonical = input as Partial<Agent>;

  const id = readString(raw, ["id", "agentId"]) ?? "unknown-agent";
  const statusRaw = readString(raw, ["status"])?.toLowerCase();
  const status =
    statusRaw === "idle" ||
    statusRaw === "running" ||
    statusRaw === "paused" ||
    statusRaw === "error"
      ? (statusRaw as AgentStatus)
      : statusRaw === "active"
        ? "running"
        : statusRaw === "stopped"
          ? "idle"
          : "unknown";

  return {
    id,
    name: canonical.name ?? readString(raw, ["name"]) ?? id,
    role: canonical.role ?? readString(raw, ["role"]) ?? "unknown",
    status,
    ownerAddress: readString(raw, ["ownerAddress"]) ?? "",
    eoaAddress: canonical.eoaAddress ?? readString(raw, ["eoaAddress", "ownerAddress"]) ?? "",
    dailyBudgetUsd: canonical.dailyBudgetUsd ?? readString(raw, ["dailyBudgetUsd"]) ?? "0",
    spentTodayUsd: canonical.spentTodayUsd ?? readString(raw, ["spentTodayUsd"]) ?? "0",
    createdAt: readString(raw, ["createdAt"]) ?? new Date().toISOString(),
    updatedAt: readString(raw, ["updatedAt", "createdAt"]) ?? new Date().toISOString()
  };
}

export function mapPayment(input: unknown): PaymentVM {
  const raw = asRecord(input);
  const canonical = input as Partial<Payment>;
  const statusRaw = readString(raw, ["status", "eventName"])?.toLowerCase() ?? "pending";

  const status: PaymentVM["status"] =
    statusRaw.includes("requested") || statusRaw.includes("challenge")
      ? "requested"
      : statusRaw.includes("authorized")
        ? "authorized"
        : statusRaw.includes("failed") || statusRaw === "error"
          ? "failed"
          : "settled";

  return {
    id: readString(raw, ["id", "settlementId", "eventId"]) ?? crypto.randomUUID(),
    agentId: canonical.agentId ?? readString(raw, ["agentId"]) ?? "unknown-agent",
    status,
    amountUsd: canonical.amountUsd ?? readString(raw, ["amountUsd", "amount", "maxAmountRequired"]) ?? "0",
    serviceUrl: canonical.serviceUrl ?? readString(raw, ["serviceUrl", "route"]) ?? "/oracle/price",
    txHash: canonical.kiteTxHash ?? readString(raw, ["txHash", "kiteTxHash"]),
    createdAt: canonical.createdAt ?? readString(raw, ["createdAt", "timestamp"]) ?? new Date().toISOString(),
    settledAt: canonical.settledAt,
    settlementId: readString(raw, ["settlementId"])
  };
}

export function mapTrade(input: unknown): TradeVM {
  const raw = asRecord(input);
  const canonical = input as Partial<Trade>;
  const tokenIn = canonical.tokenIn ?? readString(raw, ["tokenIn", "side"]) ?? "ETH";
  const tokenOut = canonical.tokenOut ?? readString(raw, ["tokenOut", "marketId"]) ?? "USDT";
  const status = normalizeTradeStatus(readString(raw, ["status"]) ?? "failed");
  const chainId = readNumber(raw, ["chainId"]);
  const executionTxHash =
    canonical.executionTxHash ??
    canonical.sepoliaTxHash ??
    readString(raw, ["executionTxHash", "sepoliaTxHash", "txHash"]);
  const executionChain = normalizeChain(
    canonical.executionChain ??
      readString(raw, ["executionChain", "chain"]) ??
      chainFromId(chainId)
  );

  return {
    id: readString(raw, ["id", "tradeId", "orderId"]) ?? crypto.randomUUID(),
    agentId: canonical.agentId ?? readString(raw, ["agentId"]) ?? "unknown-agent",
    status,
    stage: status,
    pair: `${tokenIn} -> ${tokenOut}`,
    amountIn: canonical.amountIn ?? readString(raw, ["amountIn", "size"]) ?? "0",
    amountOut: canonical.amountOut ?? readString(raw, ["amountOut"]) ?? "0",
    chainId: typeof chainId === "number" ? chainId : undefined,
    executionChain,
    executionTxHash,
    sepoliaTxHash: executionTxHash,
    kiteAttestationTx: canonical.kiteAttestationTx ?? readString(raw, ["kiteAttestationTx"]),
    strategyReason: canonical.strategyReason ?? readString(raw, ["strategyReason", "reason"]),
    createdAt: canonical.createdAt ?? readString(raw, ["createdAt", "updatedAt"]) ?? new Date().toISOString(),
    confirmedAt: canonical.confirmedAt
  };
}

export function mapActivity(input: unknown): ActivityVM {
  const raw = asRecord(input);
  const canonical = input as Partial<ActivityEvent>;
  const detail = readString(raw, ["detail", "message"]) ?? buildDetail(raw.data);
  const chainId = readNumber(raw, ["chainId"]);
  const chain = normalizeChain(canonical.chain ?? readString(raw, ["chain"]) ?? chainFromId(chainId));

  return {
    id: readString(raw, ["id", "eventId"]) ?? crypto.randomUUID(),
    agentId: canonical.agentId ?? readString(raw, ["agentId"]) ?? "unknown-agent",
    eventType: canonical.eventType ?? readString(raw, ["eventType", "eventName", "type"]) ?? "activity.new",
    chain,
    txHash: canonical.txHash ?? readString(raw, ["txHash"]),
    createdAt: canonical.createdAt ?? readString(raw, ["createdAt", "timestamp"]) ?? new Date().toISOString(),
    detail,
    paymentId: readString(raw, ["paymentId", "settlementId"]),
    tradeId: readString(raw, ["tradeId", "orderId"])
  };
}

function normalizeTradeStatus(value: string): TradeStatus {
  const normalized = value.toLowerCase();
  if (
    normalized === "quoting" ||
    normalized === "approving" ||
    normalized === "signing" ||
    normalized === "broadcast" ||
    normalized === "confirmed" ||
    normalized === "reverted" ||
    normalized === "failed"
  ) {
    return normalized as TradeStatus;
  }

  if (normalized === "executed") return "confirmed";
  if (normalized === "pending") return "quoting";
  return "failed";
}

function buildDetail(data: unknown): string {
  if (!data || typeof data !== "object") return "No metadata details";
  const pairs = Object.entries(data as Record<string, unknown>)
    .slice(0, 3)
    .map(([k, v]) => `${k}:${String(v)}`);
  return pairs.length > 0 ? pairs.join(" ") : "No metadata details";
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function readNumber(source: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function readString(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function chainFromId(chainId?: number): ActivityChain | undefined {
  if (chainId === 2368) return "kite-testnet";
  if (chainId === 10143) return "monad-testnet";
  return undefined;
}

function normalizeChain(chain?: string): ActivityChain {
  const normalized = chain?.toLowerCase();
  if (!normalized) return "kite-testnet";
  if (normalized === "kite") return "kite-testnet";
  if (normalized === "monad") return "monad-testnet";
  return normalized as ActivityChain;
}
