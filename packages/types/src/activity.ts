export type ActivityChain = "kite-testnet" | "monad-testnet" | (string & {});

export interface ActivityEvent {
  id: string;
  agentId: string;
  eventType: string;
  chain: ActivityChain;
  txHash?: string;
  blockNumber?: number;
  data: Record<string, unknown>;
  createdAt: string;
}
