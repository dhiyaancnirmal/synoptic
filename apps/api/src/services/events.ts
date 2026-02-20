import { randomUUID } from "node:crypto";
/** Prisma EventName enum values (from schema) – use string type to avoid depending on generated client export */
type PrismaEventName =
  | "AGENT_CREATED"
  | "X402_CHALLENGE_ISSUED"
  | "X402_PAYMENT_SETTLED"
  | "TRADE_EXECUTED"
  | "TRADE_REJECTED"
  | "RISK_LIMIT_HIT"
  | "BRIDGE_SUBMITTED"
  | "BRIDGE_CONFIRMED"
  | "BRIDGE_FAILED"
  | "TRADE_SWAP_SUBMITTED"
  | "TRADE_SWAP_CONFIRMED"
  | "TRADE_SWAP_FAILED";
import type { EventStatus, SynopticEventEnvelope, SynopticEventName } from "@synoptic/types/events";
import type { ApiContext } from "../context.js";

const eventNameMap: Record<SynopticEventName, PrismaEventName> = {
  "agent.created": "AGENT_CREATED",
  "x402.challenge.issued": "X402_CHALLENGE_ISSUED",
  "x402.payment.settled": "X402_PAYMENT_SETTLED",
  "trade.executed": "TRADE_EXECUTED",
  "trade.rejected": "TRADE_REJECTED",
  "risk.limit.hit": "RISK_LIMIT_HIT",
  "bridge.submitted": "BRIDGE_SUBMITTED",
  "bridge.confirmed": "BRIDGE_CONFIRMED",
  "bridge.failed": "BRIDGE_FAILED",
  "trade.swap.submitted": "TRADE_SWAP_SUBMITTED",
  "trade.swap.confirmed": "TRADE_SWAP_CONFIRMED",
  "trade.swap.failed": "TRADE_SWAP_FAILED"
};

const reverseEventNameMap = Object.fromEntries(
  Object.entries(eventNameMap).map(([key, value]) => [value, key])
) as Record<PrismaEventName, SynopticEventName>;

export async function publishEvent(
  context: ApiContext,
  params: {
    eventName: SynopticEventName;
    agentId: string;
    status: EventStatus;
    metadata: Record<string, unknown>;
  }
): Promise<SynopticEventEnvelope> {
  const payload: SynopticEventEnvelope = {
    eventId: randomUUID(),
    eventName: params.eventName,
    agentId: params.agentId,
    timestamp: new Date().toISOString(),
    status: params.status,
    metadata: params.metadata
  };

  // Prisma Json type may reference InputJsonValue not exported in some build environments
  await (context.prisma as any).event.create({
    data: {
      eventId: payload.eventId,
      eventName: eventNameMap[payload.eventName],
      agentId: payload.agentId,
      timestamp: new Date(payload.timestamp),
      status: payload.status,
      metadata: payload.metadata
    }
  });

  const ioServer = context.io as unknown as { to?: (room: string) => { emit: (event: string, data: unknown) => void }; emit?: (event: string, data: unknown) => void };
  if (ioServer.to) {
    ioServer.to(payload.agentId).emit(payload.eventName, payload);
  } else {
    ioServer.emit?.(payload.eventName, payload);
  }
  return payload;
}

export function mapDbEventToEnvelope(event: {
  eventId: string;
  eventName: PrismaEventName;
  agentId: string;
  timestamp: Date;
  status: EventStatus;
  metadata: unknown;
}): SynopticEventEnvelope {
  return {
    eventId: event.eventId,
    eventName: reverseEventNameMap[event.eventName],
    agentId: event.agentId,
    timestamp: event.timestamp.toISOString(),
    status: event.status,
    metadata: (event.metadata ?? {}) as Record<string, unknown>
  };
}
