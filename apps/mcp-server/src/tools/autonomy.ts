import type { McpAutonomyInput, McpAutonomyOutput } from "@synoptic/types/mcp";

const statuses = new Map<string, McpAutonomyOutput["status"]>();

export async function startAutonomy(input: McpAutonomyInput): Promise<McpAutonomyOutput> {
  statuses.set(input.agentId, "ACTIVE");
  return { status: "ACTIVE" };
}

export async function stopAutonomy(input: McpAutonomyInput): Promise<McpAutonomyOutput> {
  statuses.set(input.agentId, "STOPPED");
  return { status: "STOPPED" };
}
