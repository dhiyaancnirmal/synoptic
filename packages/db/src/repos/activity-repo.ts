import { desc, eq } from "drizzle-orm";
import type { ActivityEvent } from "@synoptic/types";
import { activityEvents } from "../schema.js";
import type { SynopticDb } from "../index.js";

function toActivityEvent(row: typeof activityEvents.$inferSelect): ActivityEvent {
  return {
    id: row.id,
    agentId: row.agentId,
    eventType: row.eventType,
    chain: row.chain as ActivityEvent["chain"],
    txHash: row.txHash ?? undefined,
    blockNumber: row.blockNumber ?? undefined,
    data: row.data as Record<string, unknown>,
    createdAt: row.createdAt.toISOString()
  };
}

export class ActivityRepo {
  constructor(private readonly db: SynopticDb) {}

  async list(agentId?: string): Promise<ActivityEvent[]> {
    const rows = agentId
      ? await this.db.select().from(activityEvents).where(eq(activityEvents.agentId, agentId)).orderBy(desc(activityEvents.createdAt))
      : await this.db.select().from(activityEvents).orderBy(desc(activityEvents.createdAt));

    return rows.map(toActivityEvent);
  }

  async create(input: {
    agentId: string;
    eventType: string;
    chain: ActivityEvent["chain"];
    txHash?: string;
    blockNumber?: number;
    data?: Record<string, unknown>;
  }): Promise<ActivityEvent> {
    const [row] = await this.db
      .insert(activityEvents)
      .values({
        agentId: input.agentId,
        eventType: input.eventType,
        chain: input.chain,
        txHash: input.txHash,
        blockNumber: input.blockNumber,
        data: input.data ?? {}
      })
      .returning();
    return toActivityEvent(row);
  }
}
