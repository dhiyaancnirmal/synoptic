import type { AgentRecord } from "@synoptic/types/agent";
import type { OrderRecord } from "@synoptic/types/orders";
import type {
  ApiErrorResponse,
  GetAgentResponse,
  GetOrderResponse,
  HealthResponse,
  ListAgentsResponse,
  ListEventsResponse,
  ShopifyCatalogSearchResponse,
  SiweVerifyResponse
} from "@synoptic/types/rest";
import type { SynopticEventEnvelope } from "@synoptic/types/events";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? process.env.SYNOPTIC_API_URL ?? "http://localhost:3001";

export class DashboardApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload?: ApiErrorResponse
  ) {
    super(message);
  }
}

export interface CatalogProductView {
  id: string;
  title: string;
  price?: string;
  imageUrl?: string;
  vendor?: string;
}

function resolveToken(explicit?: string): string {
  if (explicit) return explicit;
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_API_TOKEN ?? "";
  }
  return process.env.SYNOPTIC_API_TOKEN ?? process.env.NEXT_PUBLIC_API_TOKEN ?? "";
}

async function apiRequest<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  const authToken = resolveToken(token);
  if (authToken) {
    headers.set("authorization", `Bearer ${authToken}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });

  if (!response.ok) {
    let payload: ApiErrorResponse | undefined;
    try {
      payload = (await response.json()) as ApiErrorResponse;
    } catch {
      payload = undefined;
    }
    throw new DashboardApiError(payload?.message ?? `Request failed ${response.status}`, response.status, payload);
  }

  return (await response.json()) as T;
}

export async function pingApi(): Promise<string> {
  try {
    const data = await fetchHealth();
    return data.status;
  } catch {
    return "unreachable";
  }
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
  if (!res.ok) {
    throw new DashboardApiError(`Health request failed ${res.status}`, res.status);
  }
  return (await res.json()) as HealthResponse;
}

export async function fetchAgents(token?: string): Promise<AgentRecord[]> {
  const data = await apiRequest<ListAgentsResponse>("/agents", {}, token);
  return data.agents;
}

export async function fetchAgent(agentId: string, token?: string): Promise<AgentRecord> {
  const data = await apiRequest<GetAgentResponse>(`/agents/${encodeURIComponent(agentId)}`, {}, token);
  return data.agent;
}

export async function fetchEvents(agentId: string, token?: string): Promise<SynopticEventEnvelope[]> {
  const data = await apiRequest<ListEventsResponse>(`/events?agentId=${encodeURIComponent(agentId)}`, {}, token);
  return data.events;
}

export async function fetchOrder(orderId: string, token?: string): Promise<OrderRecord> {
  const data = await apiRequest<GetOrderResponse>(`/orders/${encodeURIComponent(orderId)}`, {}, token);
  return data.order;
}

export function decodeAgentIdFromToken(rawToken?: string): string | null {
  const token = resolveToken(rawToken);
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

export async function ensureDashboardToken(): Promise<string> {
  const envToken = resolveToken();
  if (envToken) {
    return envToken;
  }

  if (typeof window !== "undefined") {
    const existing = window.localStorage.getItem("synoptic.dashboard.token");
    if (existing) {
      return existing;
    }
  }

  const agentId = process.env.NEXT_PUBLIC_DASH_AGENT_ID;
  const ownerAddress = process.env.NEXT_PUBLIC_DASH_OWNER_ADDRESS;
  if (!agentId || !ownerAddress) {
    throw new DashboardApiError(
      "No dashboard token configured. Set NEXT_PUBLIC_API_TOKEN or NEXT_PUBLIC_DASH_AGENT_ID/NEXT_PUBLIC_DASH_OWNER_ADDRESS.",
      500
    );
  }

  const verify = await apiRequest<SiweVerifyResponse>("/auth/siwe/verify", {
    method: "POST",
    body: JSON.stringify({
      message: "dashboard-bootstrap",
      signature: "dashboard-bootstrap-signature",
      agentId,
      ownerAddress
    })
  });

  if (typeof window !== "undefined") {
    window.localStorage.setItem("synoptic.dashboard.token", verify.token);
  }

  return verify.token;
}

export async function searchCatalog(query: string, token?: string): Promise<CatalogProductView[]> {
  const payload = await apiRequest<ShopifyCatalogSearchResponse>(
    "/shopify/catalog/search",
    {
      method: "POST",
      body: JSON.stringify({ query, products_limit: 12, available_for_sale: true })
    },
    token
  );

  return normalizeCatalogProducts(payload.data);
}

function normalizeCatalogProducts(data: unknown): CatalogProductView[] {
  const candidates = collectObjects(data);
  const products: CatalogProductView[] = [];
  const seen = new Set<string>();

  for (const item of candidates) {
    const title = readString(item, ["title", "name", "product_title"]);
    if (!title) continue;

    const id = readString(item, ["id", "upid", "product_id", "gid"]) ?? title;
    if (seen.has(id)) continue;
    seen.add(id);

    products.push({
      id,
      title,
      price: readString(item, ["price", "min_price", "amount"]),
      vendor: readString(item, ["vendor", "brand", "shop_name"]),
      imageUrl: readString(item, ["image", "image_url", "thumbnail", "primary_image"])
    });
  }

  return products.slice(0, 12);
}

function collectObjects(input: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(input)) {
    return input.flatMap((entry) => collectObjects(entry));
  }

  if (!input || typeof input !== "object") {
    return [];
  }

  const record = input as Record<string, unknown>;
  const nested = Object.values(record).flatMap((value) => collectObjects(value));
  return [record, ...nested];
}

function readString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}
