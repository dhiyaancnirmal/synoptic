import { validateUnsignedTxData } from "./execution.js";
import type {
  UniswapCheckApprovalRequest,
  UniswapCheckApprovalResponse,
  UniswapLpRequest,
  UniswapLpResponse,
  UniswapQuoteRequest,
  UniswapQuoteResponse,
  UniswapSupportedChainsResponse,
  UniswapSwapRequest,
  UniswapSwapResponse
} from "./uniswap-types.js";
import {
  UNISWAP_CONTENT_TYPE,
  UNISWAP_DEFAULT_PROTOCOLS,
  UNISWAP_DEFAULT_ROUTING_PREFERENCE,
  UNISWAP_GATEWAY_BASE_URL,
  type UniswapSupportedChain,
  UNISWAP_UNIVERSAL_ROUTER_VERSION
} from "./uniswap-types.js";

const FALLBACK_SUPPORTED_CHAINS: UniswapSupportedChain[] = [
  { chainId: 1, name: "ethereum", supportsSwaps: true, supportsLp: true },
  { chainId: 10, name: "optimism", supportsSwaps: true, supportsLp: true },
  { chainId: 56, name: "bsc", supportsSwaps: true, supportsLp: true },
  { chainId: 130, name: "unichain", supportsSwaps: true, supportsLp: true },
  { chainId: 143, name: "monad", supportsSwaps: true, supportsLp: true },
  { chainId: 137, name: "polygon", supportsSwaps: true, supportsLp: true },
  { chainId: 8453, name: "base", supportsSwaps: true, supportsLp: true },
  { chainId: 42161, name: "arbitrum", supportsSwaps: true, supportsLp: true },
  { chainId: 81457, name: "blast", supportsSwaps: true, supportsLp: true }
];

export class UniswapClient {
  constructor(
    private readonly apiKey: string,
    private readonly apiUrl: string = UNISWAP_GATEWAY_BASE_URL,
    private readonly fetcher: typeof fetch = fetch
  ) { }

  async checkApproval(request: UniswapCheckApprovalRequest): Promise<UniswapCheckApprovalResponse> {
    const response = await this.request<UniswapCheckApprovalResponse>("/check_approval", request);
    if (response.approval && !validateUnsignedTxData(response.approval.data)) {
      throw new Error("Invalid Uniswap /check_approval transaction data");
    }
    return response;
  }

  async quote(request: UniswapQuoteRequest): Promise<UniswapQuoteResponse> {
    return this.request<UniswapQuoteResponse>("/quote", {
      ...request,
      routingPreference: request.routingPreference ?? UNISWAP_DEFAULT_ROUTING_PREFERENCE,
      protocols: request.protocols ?? [...UNISWAP_DEFAULT_PROTOCOLS]
    });
  }

  async limitOrderQuote(request: UniswapQuoteRequest): Promise<UniswapQuoteResponse> {
    return this.request<UniswapQuoteResponse>("/limit_order_quote", {
      ...request,
      routingPreference: request.routingPreference ?? UNISWAP_DEFAULT_ROUTING_PREFERENCE,
      protocols: request.protocols ?? [...UNISWAP_DEFAULT_PROTOCOLS]
    });
  }

  async swap(request: UniswapSwapRequest): Promise<UniswapSwapResponse> {
    const response = await this.request<UniswapSwapResponse>("/swap", request);
    if (!validateUnsignedTxData(response.swap?.data ?? "")) {
      throw new Error("Invalid Uniswap /swap transaction data");
    }
    return response;
  }

  async supportedChains(): Promise<UniswapSupportedChainsResponse> {
    try {
      const response = await this.requestGet<Record<string, unknown>>("/supported_chains");
      const chainsRaw = Array.isArray(response.chains) ? response.chains : [];
      const chains: UniswapSupportedChain[] = [];
      for (const chain of chainsRaw) {
        if (!chain || typeof chain !== "object") continue;
        const record = chain as Record<string, unknown>;
        const chainId = Number(record.chainId ?? record.id ?? record.chain_id);
        if (!Number.isFinite(chainId)) continue;
        chains.push({
          chainId,
          name: typeof record.name === "string" ? record.name : undefined,
          supportsSwaps: true,
          supportsLp: true
        });
      }

      if (chains.length > 0) {
        return { chains };
      }
    } catch {
      // fall through to local fallback
    }
    return { chains: [...FALLBACK_SUPPORTED_CHAINS] };
  }

  async lpApprove(request: UniswapLpRequest): Promise<UniswapLpResponse> {
    return this.request<UniswapLpResponse>("/lp/approve", request);
  }

  async lpQuote(request: UniswapLpRequest): Promise<UniswapLpResponse> {
    return this.request<UniswapLpResponse>("/lp/quote", request);
  }

  async lpCreate(request: UniswapLpRequest): Promise<UniswapLpResponse> {
    return this.request<UniswapLpResponse>("/lp/create", request);
  }

  async lpIncrease(request: UniswapLpRequest): Promise<UniswapLpResponse> {
    return this.request<UniswapLpResponse>("/lp/increase", request);
  }

  async lpDecrease(request: UniswapLpRequest): Promise<UniswapLpResponse> {
    return this.request<UniswapLpResponse>("/lp/decrease", request);
  }

  async lpCollect(request: UniswapLpRequest): Promise<UniswapLpResponse> {
    return this.request<UniswapLpResponse>("/lp/collect", request);
  }

  async lpHistory(walletAddress: string, chainId: number): Promise<UniswapLpResponse> {
    return this.requestGet<UniswapLpResponse>(
      `/lp/history?walletAddress=${encodeURIComponent(walletAddress)}&chainId=${encodeURIComponent(String(chainId))}`
    );
  }

  private async request<T>(path: string, payload: unknown): Promise<T> {
    const response = await this.fetcher(`${this.apiUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": UNISWAP_CONTENT_TYPE,
        "x-api-key": this.apiKey,
        "x-universal-router-version": UNISWAP_UNIVERSAL_ROUTER_VERSION
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Uniswap request failed (${response.status}) for ${path}: ${message}`);
    }

    return (await response.json()) as T;
  }

  private async requestGet<T>(path: string): Promise<T> {
    const response = await this.fetcher(`${this.apiUrl}${path}`, {
      method: "GET",
      headers: {
        "x-api-key": this.apiKey,
        "x-universal-router-version": UNISWAP_UNIVERSAL_ROUTER_VERSION
      }
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Uniswap request failed (${response.status}) for ${path}: ${message}`);
    }
    return (await response.json()) as T;
  }
}
