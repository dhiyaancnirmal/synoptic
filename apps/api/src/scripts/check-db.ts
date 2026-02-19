import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("database reachable");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("database unreachable", error);
  process.exit(1);
});
