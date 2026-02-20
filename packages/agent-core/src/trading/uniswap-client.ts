import { validateUnsignedTxData } from "./execution.js";
import type {
  UniswapCheckApprovalRequest,
  UniswapCheckApprovalResponse,
  UniswapQuoteRequest,
  UniswapQuoteResponse,
  UniswapSwapRequest,
  UniswapSwapResponse
} from "./uniswap-types.js";
import {
  UNISWAP_CONTENT_TYPE,
  UNISWAP_DEFAULT_PROTOCOLS,
  UNISWAP_DEFAULT_ROUTING_PREFERENCE,
  UNISWAP_GATEWAY_BASE_URL,
  UNISWAP_UNIVERSAL_ROUTER_VERSION
} from "./uniswap-types.js";

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

  async swap(request: UniswapSwapRequest): Promise<UniswapSwapResponse> {
    const response = await this.request<UniswapSwapResponse>("/swap", request);
    if (!validateUnsignedTxData(response.swap?.data ?? "")) {
      throw new Error("Invalid Uniswap /swap transaction data");
    }
    return response;
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
}
