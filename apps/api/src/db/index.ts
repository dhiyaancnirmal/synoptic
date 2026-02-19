import { PrismaClient } from "@prisma/client";
import { ApiError } from "../utils/errors.js";

let prisma: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }

  return prisma;
}

export async function ensureDatabaseReady(client: PrismaClient): Promise<void> {
  await client.$queryRaw`SELECT 1`;
}

export async function ensureMigrationsApplied(client: PrismaClient): Promise<void> {
  const migrationsTable = (await client.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
    ) AS "exists"
  `)[0];

  if (!migrationsTable?.exists) {
    throw new ApiError(
      "INTERNAL_ERROR",
      500,
      "Database schema is not initialized. Run: pnpm --filter @synoptic/api prisma:migrate:deploy",
      { reason: "MIGRATIONS_NOT_APPLIED", retryable: false }
    );
  }
}
