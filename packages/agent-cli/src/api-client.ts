import type { Config } from "./types.js";
import { KITE_MCP_SETUP_INSTRUCTIONS, type KiteMcpClient } from "./kite-mcp.js";
import logger from "./logger.js";
import { loadSession, saveSession, type AgentSession } from "./session.js";

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

export class ApiClient {
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly backoffMs: number;
  private readonly mcpClient: KiteMcpClient | null;

  constructor(config: Config, mcpClient?: KiteMcpClient | null) {
    this.baseUrl = config.apiUrl;
    this.maxRetries = config.maxRetries;
    this.backoffMs = config.backoffMs;
    this.mcpClient = mcpClient ?? null;
  }

  private readBearerToken(headers: Record<string, string>): string | undefined {
    const existing = headers.authorization ?? headers.Authorization;
    if (existing) return existing;
    const session = loadSession();
    if (!session?.accessToken) return undefined;
    return `Bearer ${session.accessToken}`;
  }

  private upsertSession(input: {
    accessToken: string;
    refreshToken: string;
    accessTtlSeconds: number;
    refreshTtlSeconds: number;
    agentId: string;
    ownerAddress: string;
  }): void {
    const existing = loadSession();
    const now = Date.now();
    const session: AgentSession = {
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      accessExpiresAt: new Date(now + input.accessTtlSeconds * 1000).toISOString(),
      refreshExpiresAt: new Date(now + input.refreshTtlSeconds * 1000).toISOString(),
      agentId: input.agentId,
      ownerAddress: input.ownerAddress,
      linkedPayerAddress: existing?.linkedPayerAddress,
      readiness: existing?.readiness
    };
    saveSession(session);
  }

  private async refreshFromSession(): Promise<boolean> {
    const session = loadSession();
    if (!session?.refreshToken) return false;
    try {
      const refreshed = await this.request<{
        code: "OK";
        data: {
          accessToken: string;
          refreshToken: string;
          accessTtlSeconds: number;
          refreshTtlSeconds: number;
          agentId: string;
          ownerAddress: string;
        };
      }>("/api/auth/session", {
        method: "POST",
        body: { refreshToken: session.refreshToken },
        maxRetries: 0
      });
      const payload = this.unwrapEnvelope<{
        accessToken: string;
        refreshToken: string;
        accessTtlSeconds: number;
        refreshTtlSeconds: number;
        agentId: string;
        ownerAddress: string;
      }>(refreshed);
      this.upsertSession(payload);
      return true;
    } catch {
      return false;
    }
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

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.requestWithRefresh(path, options, false);
  }

  private async requestWithRefresh<T>(
    path: string,
    options: RequestOptions = {},
    didRefresh: boolean
  ): Promise<T> {
    const { method = "GET", body, headers = {}, maxRetries, backoffMs } = options;
    const retries = maxRetries ?? this.maxRetries;
    const backoff = backoffMs ?? this.backoffMs;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const url = `${this.baseUrl}${path}`;
        const response = await fetch(url, {
          method,
          headers: {
            "content-type": "application/json",
            ...(this.readBearerToken(headers) ? { authorization: this.readBearerToken(headers)! } : {}),
            ...headers
          },
          body: body ? JSON.stringify(body) : undefined
        });

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

          // Resolve payer address via MCP
          const payerAddr = await this.mcpClient.getPayerAddr();

          logger.info("Got payer address", { payerAddr });

          // Approve payment via MCP
          const { paymentToken } = await this.mcpClient.approvePayment({
            payerAddr,
            payeeAddr: challenge.payTo,
            amount: challenge.maxAmountRequired,
            tokenType: challenge.asset,
            merchantName: challenge.accepts[0]?.merchantName ?? "Synoptic Oracle"
          });

          logger.info("Payment approved, retrying with token");

          // Retry the original request with payment credentials
          const retryResponse = await fetch(url, {
            method,
            headers: {
              "content-type": "application/json",
              ...headers,
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

        if (response.status === 401 && !didRefresh) {
          const refreshed = await this.refreshFromSession();
          if (refreshed) {
            return this.requestWithRefresh(path, options, true);
          }
        }

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`HTTP ${response.status}: ${text}`);
        }

        return response.json() as Promise<T>;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry MCP configuration errors
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

  async walletChallenge(params: {
    ownerAddress: string;
    agentId?: string;
  }): Promise<{
    challengeId: string;
    message: string;
    expiresAt: string;
    ownerAddress: string;
    agentId: string;
  }> {
    const raw = await this.request<unknown>("/api/auth/wallet/challenge", {
      method: "POST",
      body: params
    });
    return this.unwrapEnvelope<{
      challengeId: string;
      message: string;
      expiresAt: string;
      ownerAddress: string;
      agentId: string;
    }>(raw);
  }

  async walletVerify(params: {
    challengeId: string;
    message: string;
    signature: string;
  }): Promise<{
    accessToken: string;
    refreshToken: string;
    accessTtlSeconds: number;
    refreshTtlSeconds: number;
    agentId: string;
    ownerAddress: string;
  }> {
    const raw = await this.request<unknown>("/api/auth/wallet/verify", {
      method: "POST",
      body: params
    });
    return this.unwrapEnvelope<{
      accessToken: string;
      refreshToken: string;
      accessTtlSeconds: number;
      refreshTtlSeconds: number;
      agentId: string;
      ownerAddress: string;
    }>(raw);
  }

  async linkIdentityPayer(payerAddress: string): Promise<{
    linkedPayerAddress: string;
    ownerAddress: string;
    agentId: string;
  }> {
    const raw = await this.request<unknown>("/api/identity/link", {
      method: "POST",
      body: { payerAddress }
    });
    return this.unwrapEnvelope<{
      linkedPayerAddress: string;
      ownerAddress: string;
      agentId: string;
    }>(raw);
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
  }> {
    return this.request<{
      status: string;
      service: string;
      timestamp: string;
      dependencies: Record<string, string>;
    }>("/health");
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
    return this.unwrapEnvelope<{
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
    }>(raw);
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
    return this.unwrapEnvelope<{
      payments: Array<{
        id: string;
        status: string;
        amount: string;
        txHash?: string;
        createdAt: string;
      }>;
    }>(raw);
  }
}

export function createApiClient(config: Config, mcpClient?: KiteMcpClient | null): ApiClient {
  return new ApiClient(config, mcpClient);
}
