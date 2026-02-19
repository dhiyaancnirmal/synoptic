import { MCP_TOOL_NAMES, type McpToolName } from "@synoptic/types/mcp";
import { getIdentityStatus } from "./tools/identity.js";
import { listMarkets } from "./tools/market.js";
import { getOrderStatus } from "./tools/order.js";
import { startAutonomy, stopAutonomy } from "./tools/autonomy.js";
import { executeTrade, quoteTrade } from "./tools/trade.js";

type ToolHandler = (input: unknown) => Promise<unknown>;

const handlers: Record<McpToolName, ToolHandler> = {
  "synoptic.identity.status": (input) => getIdentityStatus(input as Parameters<typeof getIdentityStatus>[0]),
  "synoptic.market.list": (input) => listMarkets(input as Parameters<typeof listMarkets>[0]),
  "synoptic.trade.quote": (input) => quoteTrade(input as Parameters<typeof quoteTrade>[0]),
  "synoptic.trade.execute": (input) => executeTrade(input as Parameters<typeof executeTrade>[0]),
  "synoptic.order.status": (input) => getOrderStatus(input as Parameters<typeof getOrderStatus>[0]),
  "synoptic.autonomy.start": (input) => startAutonomy(input as Parameters<typeof startAutonomy>[0]),
  "synoptic.autonomy.stop": (input) => stopAutonomy(input as Parameters<typeof stopAutonomy>[0])
};

function registerTools(tools: readonly McpToolName[]): void {
  for (const tool of tools) {
    if (!handlers[tool]) {
      throw new Error(`No handler registered for ${tool}`);
    }
    console.log(`[mcp] registered tool: ${tool}`);
  }
}

function main(): void {
  registerTools(MCP_TOOL_NAMES);
  console.log("Synoptic MCP server ready");
}

main();
