export type EventStatus = "INFO" | "SUCCESS" | "ERROR";

export interface SynopticEventEnvelope {
  eventId: string;
  agentId: string;
  timestamp: string;
  status: EventStatus;
  metadata: Record<string, unknown>;
}
