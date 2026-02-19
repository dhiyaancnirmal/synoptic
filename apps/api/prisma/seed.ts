import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await prisma.agent.upsert({
    where: { agentId: "agent-seed-001" },
    update: {},
    create: {
      agentId: "agent-seed-001",
      ownerAddress: "0x0000000000000000000000000000000000000001",
      status: "ACTIVE"
    }
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
