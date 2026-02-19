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

const reverseEventNameMap: Record<PrismaEventName, SynopticEventName> = {
  AGENT_CREATED: "agent.created",
  X402_CHALLENGE_ISSUED: "x402.challenge.issued",
  X402_PAYMENT_SETTLED: "x402.payment.settled",
  TRADE_EXECUTED: "trade.executed",
  TRADE_REJECTED: "trade.rejected",
  RISK_LIMIT_HIT: "risk.limit.hit"
};

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

  context.io.emit(payload.eventName, payload);
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
