export type AgentRole = "oracle" | "strategy" | "executor";
export type AgentStatus = "idle" | "running" | "paused" | "error";

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  status: AgentStatus;
  kitePassportId?: string;
  eoaAddress: string;
  dailyBudgetUsd: string;
  spentTodayUsd: string;
  strategy?: string;
  strategyConfig?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
