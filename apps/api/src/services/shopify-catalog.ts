import type { ApiConfig } from "../config.js";
import { ApiError } from "../utils/errors.js";

interface ShopifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

interface TokenCacheEntry {
  accessToken: string;
  expiresAt: number;
}

export interface ShopifyCatalogService {
  searchCatalog(payload: Record<string, unknown>): Promise<unknown>;
  getProductDetails(upid: string): Promise<unknown>;
}

const tokenCache = new Map<string, TokenCacheEntry>();

export function createShopifyCatalogService(config: ApiConfig): ShopifyCatalogService {
  return {
    async searchCatalog(payload) {
      const token = await getAgentAccessToken(config);
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(payload)) {
        if (value !== undefined && value !== null) {
          query.set(key, String(value));
        }
      }

      const response = await fetchWithTimeout(
        `https://discover.shopifyapps.com/global/v2/search?${query.toString()}`,
        {
          method: "GET",
          headers: {
            authorization: `Bearer ${token}`
          }
        },
        config.SHOPIFY_TIMEOUT_MS
      );

      if (!response.ok) {
        const body = await response.text();
        throw new ApiError("INTERNAL_ERROR", 502, "Shopify catalog search failed", {
          reason: "SHOPIFY_CATALOG_SEARCH_FAILED",
          retryable: response.status >= 500,
          status: response.status,
          body
        });
      }

      return response.json();
    },

    async getProductDetails(upid) {
      const token = await getAgentAccessToken(config);
      const response = await fetchWithTimeout(
        `https://discover.shopifyapps.com/global/v2/p/${encodeURIComponent(upid)}`,
        {
          method: "GET",
          headers: {
            authorization: `Bearer ${token}`
          }
        },
        config.SHOPIFY_TIMEOUT_MS
      );

      if (!response.ok) {
        const body = await response.text();
        throw new ApiError("INTERNAL_ERROR", 502, "Shopify product details lookup failed", {
          reason: "SHOPIFY_PRODUCT_DETAILS_FAILED",
          retryable: response.status >= 500,
          status: response.status,
          body
        });
      }

      return response.json();
    }
  };
}

async function getAgentAccessToken(config: ApiConfig): Promise<string> {
  const clientId = config.SHOPIFY_CLIENT_ID ?? config.SHOPIFY_API_KEY;
  const clientSecret = config.SHOPIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new ApiError("INTERNAL_ERROR", 500, "Shopify credentials are not configured", {
      reason: "SHOPIFY_CREDENTIALS_MISSING",
      retryable: false
    });
  }

  const cached = tokenCache.get(clientId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.accessToken;
  }

  const response = await fetchWithTimeout(
    "https://api.shopify.com/auth/access_token",
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret
      })
    },
    config.SHOPIFY_TIMEOUT_MS
  );

  if (!response.ok) {
    const body = await response.text();
    throw new ApiError("INTERNAL_ERROR", 502, "Shopify token request failed", {
      reason: "SHOPIFY_TOKEN_REQUEST_FAILED",
      retryable: response.status >= 500,
      status: response.status,
      body
    });
  }

  const token = (await response.json()) as ShopifyTokenResponse;
  if (!token.access_token) {
    throw new ApiError("INTERNAL_ERROR", 502, "Shopify token response missing access token", {
      reason: "SHOPIFY_TOKEN_MALFORMED",
      retryable: false
    });
  }

  const expiresInMs = (token.expires_in ?? 3600) * 1000;
  tokenCache.set(clientId, {
    accessToken: token.access_token,
    expiresAt: Date.now() + expiresInMs - 30_000
  });

  return token.access_token;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError("INTERNAL_ERROR", 504, "Shopify request timed out", {
        reason: "SHOPIFY_TIMEOUT",
        retryable: true
      });
    }

    throw new ApiError("INTERNAL_ERROR", 502, "Shopify request failed", {
      reason: "SHOPIFY_NETWORK_ERROR",
      retryable: true
    });
  } finally {
    clearTimeout(timeout);
  }
}
