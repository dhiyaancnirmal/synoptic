import type { McpAutonomyInput, McpAutonomyOutput } from "@synoptic/types/mcp";
import { setAgentStatus } from "../api.js";

export async function startAutonomy(input: McpAutonomyInput): Promise<McpAutonomyOutput> {
  await setAgentStatus(input.agentId, "ACTIVE");
  return { status: "ACTIVE" };
}

export async function stopAutonomy(input: McpAutonomyInput): Promise<McpAutonomyOutput> {
  await setAgentStatus(input.agentId, "STOPPED");
  return { status: "STOPPED" };
}
