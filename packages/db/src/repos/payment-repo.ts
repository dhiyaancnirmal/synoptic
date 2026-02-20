import { desc, eq } from "drizzle-orm";
import type { Payment } from "@synoptic/types";
import { payments } from "../schema.js";
import type { SynopticDb } from "../index.js";

function toPayment(row: typeof payments.$inferSelect): Payment {
  return {
    id: row.id,
    agentId: row.agentId,
    direction: row.direction as Payment["direction"],
    amountWei: row.amountWei,
    amountUsd: String(row.amountUsd),
    tokenAddress: row.tokenAddress,
    serviceUrl: row.serviceUrl,
    status: row.status as Payment["status"],
    kiteTxHash: row.kiteTxHash ?? undefined,
    facilitatorResponse: (row.facilitatorResponse as Record<string, unknown> | null) ?? undefined,
    x402Challenge: (row.x402Challenge as Record<string, unknown> | null) ?? undefined,
    createdAt: row.createdAt.toISOString(),
    settledAt: row.settledAt?.toISOString()
  };
}

export class PaymentRepo {
  constructor(private readonly db: SynopticDb) {}

  async list(): Promise<Payment[]> {
    const rows = await this.db.select().from(payments).orderBy(desc(payments.createdAt));
    return rows.map(toPayment);
  }

  async getById(id: string): Promise<Payment | undefined> {
    const row = await this.db.query.payments.findFirst({ where: eq(payments.id, id) });
    return row ? toPayment(row) : undefined;
  }

  async create(input: {
    agentId: string;
    direction: Payment["direction"];
    amountWei: string;
    amountUsd: string;
    tokenAddress: string;
    serviceUrl: string;
    status: Payment["status"];
    x402Challenge?: Record<string, unknown>;
  }): Promise<Payment> {
    const [row] = await this.db
      .insert(payments)
      .values({
        agentId: input.agentId,
        direction: input.direction,
        amountWei: input.amountWei,
        amountUsd: input.amountUsd,
        tokenAddress: input.tokenAddress,
        serviceUrl: input.serviceUrl,
        status: input.status,
        x402Challenge: input.x402Challenge
      })
      .returning();

    return toPayment(row);
  }

  async updateStatus(
    id: string,
    status: Payment["status"],
    details?: {
      kiteTxHash?: string;
      facilitatorResponse?: Record<string, unknown>;
    }
  ): Promise<Payment | undefined> {
    const [row] = await this.db
      .update(payments)
      .set({
        status,
        kiteTxHash: details?.kiteTxHash,
        facilitatorResponse: details?.facilitatorResponse,
        settledAt: status === "settled" ? new Date() : undefined
      })
      .where(eq(payments.id, id))
      .returning();

    return row ? toPayment(row) : undefined;
  }
}
