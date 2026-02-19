export const MCP_TOOL_NAMES = [
  "synoptic.identity.status",
  "synoptic.market.list",
  "synoptic.trade.quote",
  "synoptic.trade.execute",
  "synoptic.order.status",
  "synoptic.autonomy.start",
  "synoptic.autonomy.stop"
] as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

export interface McpToolInvocation<TInput = unknown> {
  tool: McpToolName;
  input: TInput;
}
