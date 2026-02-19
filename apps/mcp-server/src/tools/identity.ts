import type { McpIdentityStatusInput, McpIdentityStatusOutput } from "@synoptic/types/mcp";
import { listAgents } from "../api.js";

export async function getIdentityStatus(input: McpIdentityStatusInput): Promise<McpIdentityStatusOutput> {
  const data = await listAgents();
  const target = data.agents.find((agent) => agent.agentId === input.agentId);
  if (!target) {
    throw new Error(`Agent ${input.agentId} not found`);
  }

  return { agent: target };
}
