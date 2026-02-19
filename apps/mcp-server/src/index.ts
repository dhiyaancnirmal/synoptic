import { MCP_TOOL_NAMES, type McpToolName } from "@synoptic/types/mcp";

function registerTools(tools: readonly McpToolName[]): void {
  for (const tool of tools) {
    console.log(`[mcp] registered tool placeholder: ${tool}`);
  }
}

function main(): void {
  registerTools(MCP_TOOL_NAMES);
  console.log("Synoptic MCP scaffold ready");
}

main();
