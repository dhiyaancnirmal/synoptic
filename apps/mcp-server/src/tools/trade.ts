import type { McpTradeExecuteInput, McpTradeExecuteOutput, McpTradeQuoteInput, McpTradeQuoteOutput } from "@synoptic/types/mcp";
import { executeMarket, quoteMarket } from "../api.js";

export async function quoteTrade(input: McpTradeQuoteInput): Promise<McpTradeQuoteOutput> {
  return quoteMarket(input);
}

export async function executeTrade(input: McpTradeExecuteInput): Promise<McpTradeExecuteOutput> {
  return executeMarket(input);
}
