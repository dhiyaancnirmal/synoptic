import type { Config } from "./types.js";
import { KITE_MCP_SETUP_INSTRUCTIONS, type KiteMcpClient } from "./kite-mcp.js";
import { loadSession, saveSession, type SessionData } from "./session.js";
import logger from "./logger.js";

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
  maxRetries?: number;
  backoffMs?: number;
}

interface X402ChallengeBody {
  x402Version: number;
  scheme: string;
  network: string;
  asset: string;
  payTo: string;
  maxAmountRequired: string;
  paymentRequestId: string;
  accepts: Array<{
    scheme: string;
    network: string;
    maxAmountRequired: string;
    payTo: string;
    asset: string;
    merchantName?: string;
  }>;
}

interface SessionRefreshResponse {
  accessToken?: string;
  refreshToken?: string;
  token?: string;
  expiresAt?: string;
  refreshExpiresAt?: string;
}

interface ApiClientOptions {
  useSession?: boolean;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly backoffMs: number;
  private readonly mcpClient: KiteMcpClient | null;
  private readonly useSession: boolean;

  constructor(config: Config, mcpClient?: KiteMcpClient | null, options: ApiClientOptions = {}) {
    this.baseUrl = config.apiUrl;
    this.maxRetries = config.maxRetries;
    this.backoffMs = config.backoffMs;
    this.mcpClient = mcpClient ?? null;
    this.useSession = options.useSession ?? false;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private parseX402ChallengeBody(body: unknown): X402ChallengeBody | null {
    if (!body || typeof body !== "object") return null;
    const b = body as Record<string, unknown>;
    if (!b.payTo || !b.asset || !b.maxAmountRequired || !b.paymentRequestId) return null;
    return {
      x402Version: typeof b.x402Version === "number" ? b.x402Version : 1,
      scheme: typeof b.scheme === "string" ? b.scheme : "gokite-aa",
      network: typeof b.network === "string" ? b.network : "kite-testnet",
      asset: String(b.asset),
      payTo: String(b.payTo),
      maxAmountRequired: String(b.maxAmountRequired),
      paymentRequestId: String(b.paymentRequestId),
      accepts: Array.isArray(b.accepts) ? (b.accepts as X402ChallengeBody["accepts"]) : []
    };
  }

  private unwrapEnvelope<T>(body: unknown): T {
    if (body && typeof body === "object") {
      const b = body as Record<string, unknown>;
      if (b.code === "OK" && "data" in b) {
        return b.data as T;
      }
    }
    return body as T;
  }

  private readSessionSafe(): SessionData | null {
    if (!this.useSession) return null;
    try {
      return loadSession();
    } catch {
      return null;
    }
  }

  private persistSessionRefresh(
    current: SessionData,
    payload: SessionRefreshResponse
  ): string | null {
    const accessToken = payload.accessToken ?? payload.token;
    if (!accessToken) return null;

    const next = saveSession({
      accessToken,
      refreshToken: payload.refreshToken ?? current.refreshToken,
      accessExpiresAt: payload.expiresAt ?? current.accessExpiresAt,
      refreshExpiresAt: payload.refreshExpiresAt ?? current.refreshExpiresAt,
      agentId: current.agentId,
      ownerAddress: current.ownerAddress,
      linkedPayerAddress: current.linkedPayerAddress,
      readiness: current.readiness
    });

    return next.accessToken;
  }

  private async refreshAccessToken(current: SessionData): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: current.refreshToken })
      });

      if (!response.ok) {
        logger.warn("Session refresh failed", { status: response.status });
        return null;
      }

      const payload = this.unwrapEnvelope<SessionRefreshResponse>(
        (await response.json()) as unknown
      );

      return this.persistSessionRefresh(current, payload);
    } catch (error) {
      logger.warn("Session refresh request failed", {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = "GET", body, headers = {}, maxRetries, backoffMs } = options;
    const retries = maxRetries ?? this.maxRetries;
    const backoff = backoffMs ?? this.backoffMs;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const url = `${this.baseUrl}${path}`;
        const requestHeaders: Record<string, string> = {
          "content-type": "application/json",
          ...headers
        };

        const session = this.readSessionSafe();
        if (session?.accessToken && !requestHeaders.authorization) {
          requestHeaders.authorization = `Bearer ${session.accessToken}`;
        }

        let response = await fetch(url, {
          method,
          headers: requestHeaders,
          body: body ? JSON.stringify(body) : undefined
        });

        if (response.status === 401 && this.useSession && session && path !== "/api/auth/session") {
          const refreshed = await this.refreshAccessToken(session);
          if (refreshed) {
            const retryHeaders = {
              ...requestHeaders,
              authorization: `Bearer ${refreshed}`
            };
            response = await fetch(url, {
              method,
              headers: retryHeaders,
              body: body ? JSON.stringify(body) : undefined
            });
          }
        }

        if (response.status === 402) {
          const challengeBody = await response.json().catch(() => null);
          const challenge = this.parseX402ChallengeBody(challengeBody);

          if (!challenge) {
            throw new Error("Received 402 but no parseable x402 challenge in response body");
          }

          if (!this.mcpClient) {
            throw new Error(`Kite MCP not configured. ${KITE_MCP_SETUP_INSTRUCTIONS}`);
          }

          logger.info("x402 payment required, initiating MCP payment", {
            amount: challenge.maxAmountRequired,
            asset: challenge.asset,
            paymentRequestId: challenge.paymentRequestId
          });

          const payerAddr = await this.mcpClient.getPayerAddr();
          const { paymentToken } = await this.mcpClient.approvePayment({
            payerAddr,
            payeeAddr: challenge.payTo,
            amount: challenge.maxAmountRequired,
            tokenType: challenge.asset,
            merchantName: challenge.accepts[0]?.merchantName ?? "Synoptic Oracle"
          });

          const retryResponse = await fetch(url, {
            method,
            headers: {
              ...requestHeaders,
              "x-payment": paymentToken,
              "x-payment-request-id": challenge.paymentRequestId
            },
            body: body ? JSON.stringify(body) : undefined
          });

          if (!retryResponse.ok) {
            const errorText = await retryResponse.text();
            throw new Error(`HTTP ${retryResponse.status} after x402 payment: ${errorText}`);
          }

          return retryResponse.json() as Promise<T>;
        }

        if (response.status === 429) {
          const retryAfter = response.headers.get("retry-after");
          const waitMs = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : backoff * Math.pow(2, attempt);
          logger.warn("Rate limited, backing off", { waitMs, attempt });
          await this.sleep(waitMs);
          continue;
        }

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`HTTP ${response.status}: ${text}`);
        }

        return response.json() as Promise<T>;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (lastError.message.includes("Kite MCP not configured")) {
          throw lastError;
        }

        if (attempt < retries) {
          const waitMs = backoff * Math.pow(2, attempt);
          logger.warn("Request failed, retrying", {
            error: lastError.message,
            attempt,
            waitMs
          });
          await this.sleep(waitMs);
        }
      }
    }

    throw lastError ?? new Error("Request failed after retries");
  }

  async getPrice(pair: string): Promise<{ price: number; timestamp: string }> {
    return this.request<{ price: number; timestamp: string }>(
      `/oracle/price?pair=${encodeURIComponent(pair)}`
    );
  }

  async getHealth(): Promise<{
    status: string;
    service: string;
    timestamp: string;
    dependencies: Record<string, string>;
    payment?: {
      mode: "facilitator" | "demo";
      configured: boolean;
      verifyReachable: "up" | "down" | "unknown";
      settleReachable: "up" | "down" | "unknown";
      lastCheckedAt?: string;
      latencyMs?: number;
      lastError?: string;
    };
  }> {
    return this.request("/health");
  }

  async getAgents(): Promise<{
    agents: Array<{ id: string; eoaAddress: string; status: string }>;
  }> {
    return this.request<{ agents: Array<{ id: string; eoaAddress: string; status: string }> }>(
      "/agents"
    );
  }

  async getQuote(params: {
    walletAddress: string;
    tokenIn?: string;
    tokenOut?: string;
    amountIn: string;
  }): Promise<{
    approvalRequestId: string;
    quoteId: string;
    amountOut: string;
    quote: Record<string, unknown>;
  }> {
    return this.request<{
      approvalRequestId: string;
      quoteId: string;
      amountOut: string;
      quote: Record<string, unknown>;
    }>("/trade/quote", {
      method: "POST",
      body: {
        walletAddress: params.walletAddress,
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn
      }
    });
  }

  async executeSwap(params: {
    quoteResponse: Record<string, unknown>;
    agentId?: string;
    tokenIn?: string;
    tokenOut?: string;
    amountIn: string;
  }): Promise<{
    tradeId: string;
    txHash: string;
    attestationTxHash?: string;
    status: string;
  }> {
    return this.request<{
      tradeId: string;
      txHash: string;
      attestationTxHash?: string;
      status: string;
    }>("/trade/execute", {
      method: "POST",
      body: {
        quoteResponse: params.quoteResponse,
        agentId: params.agentId,
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn
      }
    });
  }

  async getTrades(): Promise<{
    trades: Array<{
      id: string;
      status: string;
      tokenIn: string;
      tokenOut: string;
      amountIn: string;
      amountOut: string;
      executionTxHash?: string;
      kiteAttestationTx?: string;
      createdAt: string;
    }>;
  }> {
    const raw = await this.request<unknown>("/api/trades");
    return this.unwrapEnvelope(raw);
  }

  async getPayments(): Promise<{
    payments: Array<{
      id: string;
      status: string;
      amount: string;
      txHash?: string;
      createdAt: string;
    }>;
  }> {
    const raw = await this.request<unknown>("/api/payments");
    return this.unwrapEnvelope(raw);
  }

  async createWalletChallenge(input: {
    ownerAddress: string;
    agentId?: string;
  }): Promise<{
    challengeId: string;
    message: string;
    ownerAddress: string;
    agentId: string;
    expiresAt: string;
  }> {
    return this.request("/api/auth/wallet/challenge", {
      method: "POST",
      body: input
    });
  }

  async verifyWalletChallenge(input: {
    challengeId: string;
    message: string;
    signature: string;
    ownerAddress?: string;
    agentId?: string;
  }): Promise<{
    accessToken?: string;
    refreshToken: string;
    token?: string;
    expiresAt: string;
    refreshExpiresAt: string;
    agentId: string;
    ownerAddress: string;
  }> {
    return this.request("/api/auth/wallet/verify", {
      method: "POST",
      body: input
    });
  }

  async linkIdentity(payerAddress: string): Promise<{ linked: boolean; agentId: string }> {
    return this.request("/api/identity/link", {
      method: "POST",
      body: { payerAddress }
    });
  }

  async getIdentity(): Promise<{
    agentId: string;
    ownerAddress: string;
    payerAddress?: string;
    linked: boolean;
    linkedAt?: string;
    updatedAt?: string;
  }> {
    return this.request("/api/identity");
  }
}

export function createApiClient(
  config: Config,
  mcpClient?: KiteMcpClient | null,
  options: ApiClientOptions = {}
): ApiClient {
  return new ApiClient(config, mcpClient, options);
}
