import type { McpMarketListInput, McpMarketListOutput } from "@synoptic/types/mcp";

const DEFAULT_MARKETS: McpMarketListOutput["markets"] = [
  { marketId: "BTC-USD", venueType: "SPOT", baseAsset: "BTC", quoteAsset: "USD" },
  { marketId: "ETH-USD", venueType: "SPOT", baseAsset: "ETH", quoteAsset: "USD" },
  { marketId: "KITE-USD", venueType: "SPOT", baseAsset: "KITE", quoteAsset: "USD" }
];

export async function listMarkets(input: McpMarketListInput = {}): Promise<McpMarketListOutput> {
  if (!input.venueType) {
    return { markets: DEFAULT_MARKETS };
  }

  return { markets: DEFAULT_MARKETS.filter((market) => market.venueType === input.venueType) };
}
