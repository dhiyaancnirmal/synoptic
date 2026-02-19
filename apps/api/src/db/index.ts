import { PrismaClient } from "@prisma/client";

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
