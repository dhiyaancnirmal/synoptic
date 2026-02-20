import { desc, eq } from "drizzle-orm";
import type { Trade } from "@synoptic/types";
import { trades } from "../schema.js";
import type { SynopticDb } from "../index.js";

function toTrade(row: typeof trades.$inferSelect): Trade {
  const executionTxHash = row.executionTxHash ?? undefined;
  return {
    id: row.id,
    agentId: row.agentId,
    chainId: row.chainId,
    tokenIn: row.tokenIn,
    tokenOut: row.tokenOut,
    amountIn: row.amountIn,
    amountOut: row.amountOut,
    routingType: row.routingType,
    status: row.status as Trade["status"],
    executionTxHash,
    kiteAttestationTx: row.kiteAttestationTx ?? undefined,
    strategyReason: row.strategyReason ?? undefined,
    createdAt: row.createdAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString()
  };
}

export class TradeRepo {
  constructor(private readonly db: SynopticDb) {}

  async list(): Promise<Trade[]> {
    const rows = await this.db.select().from(trades).orderBy(desc(trades.createdAt));
    return rows.map(toTrade);
  }

  async getById(id: string): Promise<Trade | undefined> {
    const row = await this.db.query.trades.findFirst({ where: eq(trades.id, id) });
    return row ? toTrade(row) : undefined;
  }

  async create(input: {
    agentId: string;
    chainId: number;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOut: string;
    routingType: string;
    status: Trade["status"];
    strategyReason?: string;
    quoteRequest?: Record<string, unknown>;
    quoteResponse?: Record<string, unknown>;
    swapTx?: Record<string, unknown>;
  }): Promise<Trade> {
    const [row] = await this.db
      .insert(trades)
      .values({
        agentId: input.agentId,
        chainId: input.chainId,
        tokenIn: input.tokenIn,
        tokenOut: input.tokenOut,
        amountIn: input.amountIn,
        amountOut: input.amountOut,
        routingType: input.routingType,
        status: input.status,
        strategyReason: input.strategyReason,
        quoteRequest: input.quoteRequest,
        quoteResponse: input.quoteResponse,
        swapTx: input.swapTx
      })
      .returning();
    return toTrade(row);
  }

  async updateStatus(
    id: string,
    status: Trade["status"],
    details?: {
      executionTxHash?: string;
      kiteAttestationTx?: string;
      errorMessage?: string;
      gasUsed?: string;
    }
  ): Promise<Trade | undefined> {
    const [row] = await this.db
      .update(trades)
      .set({
        status,
        executionTxHash: details?.executionTxHash,
        kiteAttestationTx: details?.kiteAttestationTx,
        errorMessage: details?.errorMessage,
        gasUsed: details?.gasUsed,
        confirmedAt: status === "confirmed" ? new Date() : undefined
      })
      .where(eq(trades.id, id))
      .returning();
    return row ? toTrade(row) : undefined;
  }
}
