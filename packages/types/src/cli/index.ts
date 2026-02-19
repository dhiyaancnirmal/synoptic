export interface OperatorMonitorArgs {
  agent: string;
}

export interface AgentOnceArgs {
  agent: string;
  strategy: string;
}

export interface AgentRunArgs extends AgentOnceArgs {
  interval: string;
}

export interface AgentStopArgs {
  agent: string;
}
