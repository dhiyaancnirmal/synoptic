export type EventStatus = "INFO" | "SUCCESS" | "ERROR";
export type SynopticEventName =
  | "agent.created"
  | "x402.challenge.issued"
  | "x402.payment.settled"
  | "trade.executed"
  | "trade.rejected"
  | "risk.limit.hit";

export interface SynopticEventEnvelope {
  eventId: string;
  eventName: SynopticEventName;
  agentId: string;
  timestamp: string;
  status: EventStatus;
  metadata: Record<string, unknown>;
}
