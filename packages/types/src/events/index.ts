export type EventStatus = "INFO" | "SUCCESS" | "ERROR";
export type SynopticEventName =
  | "agent.created"
  | "x402.challenge.issued"
  | "x402.payment.settled"
  | "trade.executed"
  | "trade.rejected"
  | "risk.limit.hit"
  | "bridge.submitted"
  | "bridge.confirmed"
  | "bridge.failed"
  | "trade.swap.submitted"
  | "trade.swap.confirmed"
  | "trade.swap.failed";

export interface SynopticEventEnvelope {
  eventId: string;
  eventName: SynopticEventName;
  agentId: string;
  timestamp: string;
  status: EventStatus;
  metadata: Record<string, unknown>;
}
