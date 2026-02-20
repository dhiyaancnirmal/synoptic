import { and, desc, eq, gte } from "drizzle-orm";
import { priceSnapshots } from "../schema.js";
import type { SynopticDb } from "../index.js";

export interface PriceSnapshot {
  id: number;
  pair: string;
  price: string;
  source: string;
  timestamp: string;
}

function toPriceSnapshot(row: typeof priceSnapshots.$inferSelect): PriceSnapshot {
  return {
    id: row.id,
    pair: row.pair,
    price: String(row.price),
    source: row.source,
    timestamp: row.timestamp.toISOString()
  };
}

export class PriceRepo {
  constructor(private readonly db: SynopticDb) {}

  async create(input: { pair: string; price: string; source: string; timestamp: Date }): Promise<PriceSnapshot> {
    const [row] = await this.db
      .insert(priceSnapshots)
      .values({
        pair: input.pair,
        price: input.price,
        source: input.source,
        timestamp: input.timestamp
      })
      .returning();
    return toPriceSnapshot(row);
  }

  async listRecent(pair: string, since: Date): Promise<PriceSnapshot[]> {
    const rows = await this.db
      .select()
      .from(priceSnapshots)
      .where(and(eq(priceSnapshots.pair, pair), gte(priceSnapshots.timestamp, since)))
      .orderBy(desc(priceSnapshots.timestamp));
    return rows.map(toPriceSnapshot);
  }
}
