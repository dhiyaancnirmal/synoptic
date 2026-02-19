export type AgentStatus = "ACTIVE" | "PAUSED" | "STOPPED";

export interface AgentRecord {
  agentId: string;
  ownerAddress: string;
  status: AgentStatus;
  createdAt: string;
}
