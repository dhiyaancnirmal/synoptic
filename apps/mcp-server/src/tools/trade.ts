import type { McpTradeExecuteInput, McpTradeExecuteOutput, McpTradeQuoteInput, McpTradeQuoteOutput } from "@synoptic/types/mcp";
import { executeMarket, quoteMarket } from "../api.js";

export async function quoteTrade(input: McpTradeQuoteInput): Promise<McpTradeQuoteOutput> {
  const { xPayment, ...request } = input;
  return quoteMarket(request, xPayment);
}

export async function executeTrade(input: McpTradeExecuteInput): Promise<McpTradeExecuteOutput> {
  const { xPayment, ...request } = input;
  return executeMarket(request, xPayment);
}
