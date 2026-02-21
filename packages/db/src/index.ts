import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

let pool: Pool | undefined;

export function createDbClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl
    });
  }

  return drizzle(pool, { schema });
}

export type SynopticDb = ReturnType<typeof createDbClient>;

export * from "./schema.js";
export * from "./repos/index.js";
export { eq, desc, and, sql } from "drizzle-orm";
