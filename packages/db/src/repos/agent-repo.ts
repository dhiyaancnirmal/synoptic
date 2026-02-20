import { and, desc, eq } from "drizzle-orm";
import type { Agent } from "@synoptic/types";
import { agents } from "../schema.js";
import type { SynopticDb } from "../index.js";

function toAgent(row: typeof agents.$inferSelect): Agent {
  return {
    id: row.id,
    name: row.name,
    role: row.role as Agent["role"],
    status: row.status as Agent["status"],
    kitePassportId: row.kitePassportId ?? undefined,
    eoaAddress: row.eoaAddress,
    dailyBudgetUsd: String(row.dailyBudgetUsd),
    spentTodayUsd: String(row.spentTodayUsd),
    strategy: row.strategy ?? undefined,
    strategyConfig: (row.strategyConfig as Record<string, unknown> | null) ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export class AgentRepo {
  constructor(private readonly db: SynopticDb) {}

  async list(): Promise<Agent[]> {
    const rows = await this.db.select().from(agents).orderBy(desc(agents.createdAt));
    return rows.map(toAgent);
  }

  async getById(id: string): Promise<Agent | undefined> {
    const row = await this.db.query.agents.findFirst({ where: eq(agents.id, id) });
    return row ? toAgent(row) : undefined;
  }

  async create(input: {
    name: string;
    role: Agent["role"];
    eoaAddress: string;
    dailyBudgetUsd: string;
    strategy?: string;
    strategyConfig?: Record<string, unknown>;
    kitePassportId?: string;
  }): Promise<Agent> {
    const [row] = await this.db
      .insert(agents)
      .values({
        name: input.name,
        role: input.role,
        status: "idle",
        eoaAddress: input.eoaAddress,
        dailyBudgetUsd: input.dailyBudgetUsd,
        spentTodayUsd: "0",
        strategy: input.strategy,
        strategyConfig: input.strategyConfig ?? {},
        kitePassportId: input.kitePassportId
      })
      .returning();

    return toAgent(row);
  }

  async update(id: string, input: { name?: string; strategy?: string }): Promise<Agent | undefined> {
    const [row] = await this.db
      .update(agents)
      .set({
        name: input.name,
        strategy: input.strategy,
        updatedAt: new Date()
      })
      .where(eq(agents.id, id))
      .returning();

    return row ? toAgent(row) : undefined;
  }

  async setStatus(id: string, status: Agent["status"], errorMessage?: string): Promise<Agent | undefined> {
    const [row] = await this.db
      .update(agents)
      .set({
        status,
        errorMessage,
        updatedAt: new Date()
      })
      .where(eq(agents.id, id))
      .returning();
    return row ? toAgent(row) : undefined;
  }

  async setSpentTodayUsd(id: string, spentTodayUsd: string): Promise<Agent | undefined> {
    const [row] = await this.db
      .update(agents)
      .set({
        spentTodayUsd,
        updatedAt: new Date()
      })
      .where(eq(agents.id, id))
      .returning();
    return row ? toAgent(row) : undefined;
  }

  async findByAddress(address: string): Promise<Agent | undefined> {
    const row = await this.db.query.agents.findFirst({
      where: and(eq(agents.eoaAddress, address))
    });
    return row ? toAgent(row) : undefined;
  }
}
