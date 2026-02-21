import { mapActivity, mapAgent, mapPayment, mapTrade } from "@/lib/mappers";
import type { ActivityVM, AgentVM, PaymentVM, TradeVM } from "@/lib/mappers";

export type ApiMode = "compat" | "canonical";

export interface ApiErrorPayload {
  code?: string;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload?: ApiErrorPayload
  ) {
    super(message);
  }
}

export interface OraclePriceResult {
  ok: boolean;
  status: number;
  challenge?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

interface EthereumProvider {
  isMetaMask?: boolean;
  providers?: EthereumProvider[];
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
}

interface SiweChallengeResponse {
  challengeId: string;
  message: string;
  ownerAddress: string;
  agentId: string;
  expiresAt: string;
}

export interface MarketplaceCatalogItem {
  sku: string;
  name: string;
  description: string;
  priceUsd: number;
  dataSource: string;
}

export interface MarketplacePurchase {
  id: string;
  sku: string;
  paymentId?: string;
  status: string;
  resultHash?: string;
  createdAt: string;
}

export interface ApiClient {
  mode: ApiMode;
  getToken: () => Promise<string>;
  listAgents: (token?: string) => Promise<AgentVM[]>;
  getAgent: (agentId: string, token?: string) => Promise<AgentVM>;
  startAgent: (agentId: string, token?: string) => Promise<void>;
  stopAgent: (agentId: string, token?: string) => Promise<void>;
  triggerAgent: (agentId: string, token?: string) => Promise<void>;
  listPayments: (token?: string) => Promise<PaymentVM[]>;
  getPayment: (paymentId: string, token?: string) => Promise<PaymentVM | null>;
  listTrades: (token?: string) => Promise<TradeVM[]>;
  getTrade: (tradeId: string, token?: string) => Promise<TradeVM | null>;
  listActivity: (token?: string) => Promise<ActivityVM[]>;
  getOraclePrice: (pair: string, xPayment?: string, token?: string) => Promise<OraclePriceResult>;
  getMarketplaceCatalog: () => Promise<MarketplaceCatalogItem[]>;
  listMarketplacePurchases: (token?: string) => Promise<MarketplacePurchase[]>;
}

const API_URL =
  process.env.NEXT_PUBLIC_AGENT_SERVER_URL ??
  process.env.SYNOPTIC_AGENT_SERVER_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.SYNOPTIC_API_URL ??
  "http://localhost:3001";

const TOKEN_STORAGE_KEY = "synoptic.dashboard.session.token";

const DEFAULT_API_MODE: ApiMode =
  process.env.NEXT_PUBLIC_API_MODE === "compat" ? "compat" : "canonical";

const ALLOW_COMPAT_MODE = process.env.NEXT_PUBLIC_ALLOW_COMPAT_MODE === "true";

export function createApiClient(mode: ApiMode = DEFAULT_API_MODE): ApiClient {
  const resolvedMode = mode === "compat" && !ALLOW_COMPAT_MODE ? "canonical" : mode;

  return {
    mode: resolvedMode,
    getToken: async () => ensureDashboardSessionToken(),
    listAgents: async (token) => listAgents(resolvedMode, token),
    getAgent: async (agentId, token) => getAgent(resolvedMode, agentId, token),
    startAgent: async (agentId, token) => mutateAgent(resolvedMode, agentId, "start", token),
    stopAgent: async (agentId, token) => mutateAgent(resolvedMode, agentId, "stop", token),
    triggerAgent: async (agentId, token) => mutateAgent(resolvedMode, agentId, "trigger", token),
    listPayments: async (token) => listPayments(resolvedMode, token),
    getPayment: async (paymentId, token) => getPayment(resolvedMode, paymentId, token),
    listTrades: async (token) => listTrades(resolvedMode, token),
    getTrade: async (tradeId, token) => getTrade(resolvedMode, tradeId, token),
    listActivity: async (token) => listActivity(resolvedMode, token),
    getOraclePrice: async (pair, xPayment, token) => getOraclePrice(pair, xPayment, token),
    getMarketplaceCatalog: async () => getMarketplaceCatalog(),
    listMarketplacePurchases: async (token) => listMarketplacePurchases(token)
  };
}

export async function fetchHealth(): Promise<{ status: string;[key: string]: unknown }> {
  const response = await fetch(`${API_URL}/health`, { cache: "no-store" });
  if (!response.ok) {
    throw new ApiClientError(`Health request failed ${response.status}`, response.status);
  }
  return (await response.json()) as { status: string;[key: string]: unknown };
}

export async function pingApi(): Promise<string> {
  try {
    const payload = await fetchHealth();
    return typeof payload.status === "string" ? payload.status : "ok";
  } catch {
    return "unreachable";
  }
}

export async function ensureDashboardSessionToken(): Promise<string> {
  const envToken = resolveToken();
  if (envToken) return envToken;

  const existing = readSessionToken();
  if (existing) return existing;

  return bootstrapPassportSession();
}

export function clearSessionToken(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
}

export function getSessionToken(): string {
  return readSessionToken();
}

export function setSessionToken(token: string): void {
  if (!token || token.trim().length === 0) {
    throw new ApiClientError("Cannot set an empty session token.", 400);
  }
  writeSessionToken(token.trim());
}

export function getApiMode(): ApiMode {
  return DEFAULT_API_MODE;
}

export function decodeAgentIdFromToken(rawToken?: string): string | null {
  const token = resolveToken(rawToken) || readSessionToken();
  if (!token) return null;
  const [, payload] = token.split(".");
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    const decodedRaw =
      typeof window !== "undefined"
        ? window.atob(padded)
        : Buffer.from(padded, "base64").toString("utf-8");
    const decoded = JSON.parse(decodedRaw) as { agentId?: string };
    return decoded.agentId ?? null;
  } catch {
    return null;
  }
}

async function listAgents(mode: ApiMode, token?: string): Promise<AgentVM[]> {
  const path = mode === "canonical" ? "/api/agents" : "/agents";
  const payload = await request<Record<string, unknown>>(path, {}, token);
  const raw = asArray(payload.agents);
  return raw.map(mapAgent);
}

async function getAgent(mode: ApiMode, agentId: string, token?: string): Promise<AgentVM> {
  const base = mode === "canonical" ? "/api/agents" : "/agents";
  const payload = await request<Record<string, unknown>>(
    `${base}/${encodeURIComponent(agentId)}`,
    {},
    token
  );

  return mapAgent(payload.agent ?? payload);
}

async function mutateAgent(
  mode: ApiMode,
  agentId: string,
  action: "start" | "stop" | "trigger",
  token?: string
): Promise<void> {
  const base = mode === "canonical" ? "/api/agents" : "/agents";
  await request(`${base}/${encodeURIComponent(agentId)}/${action}`, {
    method: "POST",
    headers: {
      "idempotency-key": `dash-${action}-${createIdempotencyKey()}`
    }
  }, token);
}

async function listActivity(mode: ApiMode, token?: string): Promise<ActivityVM[]> {
  if (mode === "canonical") {
    const payload = await request<Record<string, unknown>>("/api/activity", {}, token);
    return asArray(payload.events).map(mapActivity).sort(sortByCreatedDesc);
  }

  const compatAgents = await listAgents("compat", token);
  const targetId = decodeAgentIdFromToken(token) ?? compatAgents[0]?.id;
  if (!targetId) return [];

  const payload = await request<Record<string, unknown>>(
    `/events?agentId=${encodeURIComponent(targetId)}`,
    {},
    token
  );
  return asArray(payload.events).map(mapActivity).sort(sortByCreatedDesc);
}

async function listTrades(mode: ApiMode, token?: string): Promise<TradeVM[]> {
  if (mode === "canonical") {
    const payload = await request<Record<string, unknown>>("/api/trades", {}, token);
    return asArray(payload.trades).map(mapTrade).sort(sortByCreatedDesc);
  }

  const activity = await listActivity("compat", token);
  const orderIds = Array.from(
    new Set(activity.map((item) => item.tradeId).filter((value): value is string => Boolean(value)))
  );

  const trades = await Promise.all(
    orderIds.map(async (id) => {
      try {
        const payload = await request<Record<string, unknown>>(`/orders/${encodeURIComponent(id)}`, {}, token);
        return mapTrade(payload.order ?? payload);
      } catch {
        return null;
      }
    })
  );

  return trades.filter((item): item is TradeVM => Boolean(item)).sort(sortByCreatedDesc);
}

async function getTrade(mode: ApiMode, tradeId: string, token?: string): Promise<TradeVM | null> {
  const path = mode === "canonical" ? `/api/trades/${encodeURIComponent(tradeId)}` : `/orders/${encodeURIComponent(tradeId)}`;
  try {
    const payload = await request<Record<string, unknown>>(path, {}, token);
    return mapTrade(payload.trade ?? payload.order ?? payload);
  } catch {
    return null;
  }
}

async function listPayments(mode: ApiMode, token?: string): Promise<PaymentVM[]> {
  if (mode === "canonical") {
    const payload = await request<Record<string, unknown>>("/api/payments", {}, token);
    return asArray(payload.payments).map(mapPayment).sort(sortByCreatedDesc);
  }

  const activity = await listActivity("compat", token);
  return activity
    .filter((item) => item.eventType.includes("x402") || item.eventType.includes("payment"))
    .map((item) =>
      mapPayment({
        id: item.id,
        agentId: item.agentId,
        status: item.eventType,
        createdAt: item.createdAt,
        settlementId: item.paymentId,
        txHash: item.txHash,
        route: item.detail
      })
    )
    .sort(sortByCreatedDesc);
}

async function getPayment(mode: ApiMode, paymentId: string, token?: string): Promise<PaymentVM | null> {
  if (mode === "canonical") {
    try {
      const payload = await request<Record<string, unknown>>(`/api/payments/${encodeURIComponent(paymentId)}`, {}, token);
      return mapPayment(payload.payment ?? payload);
    } catch {
      return null;
    }
  }

  const payments = await listPayments("compat", token);
  return payments.find((item) => item.id === paymentId || item.settlementId === paymentId) ?? null;
}

async function getOraclePrice(
  pair: string,
  xPayment?: string,
  token?: string
): Promise<OraclePriceResult> {
  const headers = new Headers({
    "content-type": "application/json"
  });
  const authToken = resolveToken(token) || readSessionToken();
  if (authToken) headers.set("authorization", `Bearer ${authToken}`);
  if (xPayment) headers.set("x-payment", xPayment);

  const response = await fetch(`${API_URL}/oracle/price?pair=${encodeURIComponent(pair)}`, {
    headers,
    cache: "no-store"
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (response.status === 402) {
    return {
      ok: false,
      status: response.status,
      challenge: payload
    };
  }

  return {
    ok: response.ok,
    status: response.status,
    payload
  };
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const authToken = resolveToken(token) || readSessionToken();
  if (authToken) {
    headers.set("authorization", `Bearer ${authToken}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });

  if (!response.ok) {
    let payload: ApiErrorPayload | undefined;
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      payload = undefined;
    }

    if (response.status === 401 && typeof window !== "undefined") {
      clearSessionToken();
    }

    throw new ApiClientError(
      payload?.message ??
      (response.status === 401
        ? "Session expired. Use /login to authenticate again."
        : `Request failed ${response.status}`),
      response.status,
      payload
    );
  }

  const payload = (await response.json()) as unknown;
  return unwrapApiPayload<T>(payload);
}

function readSessionToken(): string {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
}

function writeSessionToken(token: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
}

function resolveToken(explicit?: string): string {
  if (explicit) return explicit;
  if (typeof window !== "undefined") {
    // Browser runtime should rely on session tokens, not public env token injection.
    return "";
  }
  return (
    process.env.SYNOPTIC_AGENT_SERVER_TOKEN ??
    process.env.SYNOPTIC_API_TOKEN ??
    ""
  );
}

function getEthereumProvider(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  const provider = (window as Window & { ethereum?: EthereumProvider }).ethereum;
  if (!provider) return null;
  const providers = Array.isArray(provider.providers) ? provider.providers : [];
  const metaMaskProvider = providers.find((candidate) => candidate?.isMetaMask);
  return metaMaskProvider ?? provider;
}

function walletErrorCode(cause: unknown): number | null {
  if (!cause || typeof cause !== "object") return null;
  const code = (cause as { code?: unknown }).code;
  return typeof code === "number" ? code : null;
}

function walletErrorMessage(cause: unknown): string {
  if (!cause || typeof cause !== "object") return "";
  const message = (cause as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
}

function mapWalletError(cause: unknown): ApiClientError {
  if (cause instanceof ApiClientError) return cause;
  const code = walletErrorCode(cause);
  const message = walletErrorMessage(cause);

  if (code === 4001) {
    return new ApiClientError(
      "Wallet request was rejected. Approve the wallet prompt to continue.",
      401
    );
  }

  if (code === -32002) {
    return new ApiClientError(
      "Wallet request already pending. Open your wallet extension, complete the pending prompt, then retry.",
      409
    );
  }

  if (
    message.includes("Failed to connect to MetaMask") ||
    message.includes("Unexpected error")
  ) {
    return new ApiClientError(
      "Wallet provider conflict detected. Disable other wallet extensions or switch the active provider to MetaMask, then retry.",
      401
    );
  }

  return new ApiClientError(
    message || "Wallet interaction failed. Check your extension and retry.",
    401
  );
}

async function requestWallet(
  provider: EthereumProvider,
  args: { method: string; params?: unknown[] | Record<string, unknown> }
): Promise<unknown> {
  try {
    return await provider.request(args);
  } catch (cause) {
    throw mapWalletError(cause);
  }
}

async function bootstrapPassportSession(): Promise<string> {
  const provider = getEthereumProvider();
  if (!provider) {
    throw new ApiClientError(
      "Wallet provider not detected. Install or unlock an EVM wallet and retry.",
      401
    );
  }

  const accounts = (await requestWallet(provider, {
    method: "eth_requestAccounts"
  })) as string[] | undefined;
  const ownerAddress = accounts?.[0];
  if (!ownerAddress) {
    throw new ApiClientError("No wallet account available for signing.", 401);
  }

  const challenge = await request<SiweChallengeResponse>("/auth/siwe/challenge", {
    method: "POST",
    body: JSON.stringify({ ownerAddress })
  });

  const signature = (await requestWallet(provider, {
    method: "personal_sign",
    params: [challenge.message, ownerAddress]
  })) as string | undefined;

  if (!signature) {
    throw new ApiClientError("Signature was rejected by wallet.", 401);
  }

  const verify = await request<{ token: string }>("/auth/siwe/verify", {
    method: "POST",
    body: JSON.stringify({
      challengeId: challenge.challengeId,
      message: challenge.message,
      signature,
      ownerAddress: challenge.ownerAddress,
      agentId: challenge.agentId
    })
  });

  if (!verify.token) {
    throw new ApiClientError("Passport authentication did not return a session token.", 401);
  }

  writeSessionToken(verify.token);
  return verify.token;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function sortByCreatedDesc<T extends { createdAt: string }>(a: T, b: T): number {
  return b.createdAt.localeCompare(a.createdAt);
}

function createIdempotencyKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

async function getMarketplaceCatalog(): Promise<MarketplaceCatalogItem[]> {
  const response = await fetch(`${API_URL}/marketplace/catalog`, { cache: "no-store" });
  if (!response.ok) {
    throw new ApiClientError(`Catalog request failed ${response.status}`, response.status);
  }
  const data = (await response.json()) as { catalog: MarketplaceCatalogItem[] };
  return data.catalog ?? [];
}

async function listMarketplacePurchases(token?: string): Promise<MarketplacePurchase[]> {
  const payload = await request<{ purchases: MarketplacePurchase[] }>(
    "/api/marketplace/purchases",
    {},
    token
  );
  return payload.purchases ?? [];
}

function unwrapApiPayload<T>(payload: unknown): T {
  if (!payload || typeof payload !== "object") {
    return payload as T;
  }

  const record = payload as Record<string, unknown>;
  if (record.code === "OK" && record.data && typeof record.data === "object") {
    return record.data as T;
  }

  return payload as T;
}
