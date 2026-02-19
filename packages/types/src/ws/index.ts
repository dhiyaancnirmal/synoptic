import type { SynopticEventEnvelope } from "../events/index.js";

export type WsEventName =
  | "agent.created"
  | "x402.challenge.issued"
  | "x402.payment.settled"
  | "trade.executed"
  | "trade.rejected"
  | "risk.limit.hit";

export interface WsEventPayload extends SynopticEventEnvelope {
  eventName: WsEventName;
}
