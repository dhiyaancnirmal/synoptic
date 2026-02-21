import { desc, eq } from "drizzle-orm";
import type { LiquidityAction } from "@synoptic/types";
import { liquidityActions } from "../schema.js";
import type { SynopticDb } from "../index.js";

function toLiquidityAction(row: typeof liquidityActions.$inferSelect): LiquidityAction {
  return {
    id: row.id,
    agentId: row.agentId,
    actionType: row.actionType as LiquidityAction["actionType"],
    chainId: row.chainId,
    token0: row.token0,
    token1: row.token1,
    feeTier: row.feeTier,
    preset: row.preset as LiquidityAction["preset"],
    lowerBoundPct: Number(row.lowerBoundPct),
    upperBoundPct: Number(row.upperBoundPct),
    amount0: row.amount0,
    amount1: row.amount1,
    positionId: row.positionId ?? undefined,
    txHash: row.txHash ?? undefined,
    status: row.status as LiquidityAction["status"],
    errorMessage: row.errorMessage ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export class LiquidityRepo {
  constructor(private readonly db: SynopticDb) {}

  async list(limit = 200): Promise<LiquidityAction[]> {
    const rows = await this.db
      .select()
      .from(liquidityActions)
      .orderBy(desc(liquidityActions.createdAt))
      .limit(limit);
    return rows.map(toLiquidityAction);
  }

  async create(input: {
    agentId: string;
    actionType: LiquidityAction["actionType"];
    chainId: number;
    token0: string;
    token1: string;
    feeTier: number;
    preset: LiquidityAction["preset"];
    lowerBoundPct: number;
    upperBoundPct: number;
    amount0: string;
    amount1: string;
    positionId?: string;
    txHash?: string;
    status: LiquidityAction["status"];
    errorMessage?: string;
  }): Promise<LiquidityAction> {
    const [row] = await this.db
      .insert(liquidityActions)
      .values({
        agentId: input.agentId,
        actionType: input.actionType,
        chainId: input.chainId,
        token0: input.token0,
        token1: input.token1,
        feeTier: input.feeTier,
        preset: input.preset,
        lowerBoundPct: String(input.lowerBoundPct),
        upperBoundPct: String(input.upperBoundPct),
        amount0: input.amount0,
        amount1: input.amount1,
        positionId: input.positionId,
        txHash: input.txHash,
        status: input.status,
        errorMessage: input.errorMessage
      })
      .returning();
    return toLiquidityAction(row);
  }

  async update(
    id: string,
    input: {
      status?: LiquidityAction["status"];
      txHash?: string;
      positionId?: string;
      errorMessage?: string;
    }
  ): Promise<LiquidityAction | undefined> {
    const [row] = await this.db
      .update(liquidityActions)
      .set({
        status: input.status,
        txHash: input.txHash,
        positionId: input.positionId,
        errorMessage: input.errorMessage,
        updatedAt: new Date()
      })
      .where(eq(liquidityActions.id, id))
      .returning();
    return row ? toLiquidityAction(row) : undefined;
  }
}
