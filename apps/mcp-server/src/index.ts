import { z } from "zod";
import { pathToFileURL } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getIdentityStatus } from "./tools/identity.js";
import { listMarkets } from "./tools/market.js";
import { getOrderStatus } from "./tools/order.js";
import { startAutonomy, stopAutonomy } from "./tools/autonomy.js";
import { executeTrade, quoteTrade } from "./tools/trade.js";

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  handler: (input: unknown) => Promise<unknown>;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "synoptic.identity.status",
    description: "Fetches the current identity and status for an agent.",
    inputSchema: z.object({ agentId: z.string().min(1) }),
    handler: (input) => getIdentityStatus(input as Parameters<typeof getIdentityStatus>[0])
  },
  {
    name: "synoptic.market.list",
    description: "Lists available markets and optional Shopify catalog matches.",
    inputSchema: z
      .object({
        venueType: z.enum(["SPOT", "PERP", "PREDICTION"]).optional(),
        query: z.string().optional(),
        products_limit: z.number().int().positive().max(50).optional()
      })
      .optional(),
    handler: (input) => listMarkets((input ?? {}) as Parameters<typeof listMarkets>[0])
  },
  {
    name: "synoptic.trade.quote",
    description: "Requests a trade quote for a market order.",
    inputSchema: z.object({
      agentId: z.string().min(1),
      venueType: z.enum(["SPOT", "PERP", "PREDICTION"]),
      marketId: z.string().min(1),
      side: z.enum(["BUY", "SELL"]),
      size: z.string().min(1),
      limitPrice: z.string().optional()
    }),
    handler: (input) => quoteTrade(input as Parameters<typeof quoteTrade>[0])
  },
  {
    name: "synoptic.trade.execute",
    description: "Executes a trade and returns order + settlement details.",
    inputSchema: z.object({
      agentId: z.string().min(1),
      quoteId: z.string().uuid().optional(),
      venueType: z.enum(["SPOT", "PERP", "PREDICTION"]),
      marketId: z.string().min(1),
      side: z.enum(["BUY", "SELL"]),
      size: z.string().min(1),
      limitPrice: z.string().optional()
    }),
    handler: (input) => executeTrade(input as Parameters<typeof executeTrade>[0])
  },
  {
    name: "synoptic.order.status",
    description: "Fetches a single order by orderId.",
    inputSchema: z.object({ orderId: z.string().min(1) }),
    handler: (input) => getOrderStatus(input as Parameters<typeof getOrderStatus>[0])
  },
  {
    name: "synoptic.autonomy.start",
    description: "Marks an agent autonomy state as ACTIVE.",
    inputSchema: z.object({ agentId: z.string().min(1) }),
    handler: (input) => startAutonomy(input as Parameters<typeof startAutonomy>[0])
  },
  {
    name: "synoptic.autonomy.stop",
    description: "Marks an agent autonomy state as STOPPED.",
    inputSchema: z.object({ agentId: z.string().min(1) }),
    handler: (input) => stopAutonomy(input as Parameters<typeof stopAutonomy>[0])
  }
];

export function createMcpServer(): Server {
  const server = new Server(
    {
      name: "synoptic-mcp-server",
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: z.toJSONSchema(tool.inputSchema)
    }))
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const name = request.params.name;
    const tool = TOOL_DEFINITIONS.find((candidate) => candidate.name === name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown tool: ${name}` }]
      };
    }

    const parsed = tool.inputSchema.safeParse(request.params.arguments ?? {});
    if (!parsed.success) {
      return {
        isError: true,
        content: [{ type: "text", text: `Invalid input: ${parsed.error.issues.map((issue) => issue.message).join(", ")}` }]
      };
    }

    try {
      const result = await tool.handler(parsed.data);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result as Record<string, unknown>
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool execution failed";
      return {
        isError: true,
        content: [{ type: "text", text: message }]
      };
    }
  });

  return server;
}

export async function main(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("Failed to start MCP server", error);
    process.exit(1);
  });
}
