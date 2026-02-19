import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { EventName as PrismaEventName } from "@prisma/client";
import type { EventStatus, SynopticEventEnvelope, SynopticEventName } from "@synoptic/types/events";
import type { ApiContext } from "../context.js";

const eventNameMap: Record<SynopticEventName, PrismaEventName> = {
  "agent.created": "AGENT_CREATED",
  "x402.challenge.issued": "X402_CHALLENGE_ISSUED",
  "x402.payment.settled": "X402_PAYMENT_SETTLED",
  "trade.executed": "TRADE_EXECUTED",
  "trade.rejected": "TRADE_REJECTED",
  "risk.limit.hit": "RISK_LIMIT_HIT"
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

  await context.prisma.event.create({
    data: {
      eventId: payload.eventId,
      eventName: eventNameMap[payload.eventName],
      agentId: payload.agentId,
      timestamp: new Date(payload.timestamp),
      status: payload.status,
      metadata: payload.metadata as Prisma.InputJsonValue
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
