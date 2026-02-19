import type { McpMarketListInput, McpMarketListOutput } from "@synoptic/types/mcp";
import { getShopifyProductDetails, searchShopifyCatalog } from "../api.js";

const DEFAULT_MARKETS: McpMarketListOutput["markets"] = [
  { marketId: "KITE_bUSDT_BASE_SEPOLIA", venueType: "SPOT", baseAsset: "KITE", quoteAsset: "bUSDT" }
];

export async function listMarkets(input: McpMarketListInput = {}): Promise<McpMarketListOutput> {
  if (input.query?.startsWith("upid:")) {
    const upid = input.query.slice("upid:".length).trim();
    if (!upid) {
      return { markets: DEFAULT_MARKETS };
    }

    const details = await getShopifyProductDetails(upid);
    return { markets: DEFAULT_MARKETS, catalog: details.data };
  }

  if (input.query) {
    const catalog = await searchShopifyCatalog({
      query: input.query,
      products_limit: input.products_limit
    });

    const markets = input.venueType ? DEFAULT_MARKETS.filter((market) => market.venueType === input.venueType) : DEFAULT_MARKETS;
    return { markets, catalog: catalog.data };
  }

  if (!input.venueType) {
    return { markets: DEFAULT_MARKETS };
  }

  return { markets: DEFAULT_MARKETS.filter((market) => market.venueType === input.venueType) };
}
