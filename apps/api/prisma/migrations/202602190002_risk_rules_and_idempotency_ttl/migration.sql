-- AlterTable
ALTER TABLE "IdempotencyKey" ADD COLUMN "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT NOW() + INTERVAL '24 hours';

-- CreateTable
CREATE TABLE "RiskRule" (
    "agentId" TEXT NOT NULL,
    "perTxLimit" TEXT NOT NULL,
    "dailyLimit" TEXT NOT NULL,
    "dailySpent" TEXT NOT NULL DEFAULT '0',
    "lastResetDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskRule_pkey" PRIMARY KEY ("agentId")
);

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- AddForeignKey
ALTER TABLE "RiskRule" ADD CONSTRAINT "RiskRule_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("agentId") ON DELETE CASCADE ON UPDATE CASCADE;
