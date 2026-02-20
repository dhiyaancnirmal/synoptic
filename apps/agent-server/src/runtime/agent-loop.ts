export interface AgentLoopInput {
  agentId: string;
}

export interface AgentTickResult {
  detail: string;
}

export type AgentTickRunner = (input: AgentLoopInput) => Promise<AgentTickResult>;

export async function runAgentTick(input: AgentLoopInput): Promise<AgentTickResult> {
  return { detail: `tick:${input.agentId}` };
}
