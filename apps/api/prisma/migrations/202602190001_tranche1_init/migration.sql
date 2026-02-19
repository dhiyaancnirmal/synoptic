-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'STOPPED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'EXECUTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VenueType" AS ENUM ('SPOT', 'PERP', 'PREDICTION');

-- CreateEnum
CREATE TYPE "OrderSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "OrderRejectionReason" AS ENUM ('INSUFFICIENT_FUNDS', 'INVALID_PAYMENT', 'FACILITATOR_UNAVAILABLE', 'RISK_LIMIT', 'INVALID_REQUEST');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('SETTLED', 'FAILED');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('INFO', 'SUCCESS', 'ERROR');

-- CreateEnum
CREATE TYPE "EventName" AS ENUM ('AGENT_CREATED', 'X402_CHALLENGE_ISSUED', 'X402_PAYMENT_SETTLED', 'TRADE_EXECUTED', 'TRADE_REJECTED', 'RISK_LIMIT_HIT');

-- CreateTable
CREATE TABLE "Agent" (
    "agentId" TEXT NOT NULL,
    "ownerAddress" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("agentId")
);

-- CreateTable
CREATE TABLE "Order" (
    "orderId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "venueType" "VenueType" NOT NULL,
    "marketId" TEXT NOT NULL,
    "side" "OrderSide" NOT NULL,
    "size" TEXT NOT NULL,
    "limitPrice" TEXT,
    "rejectionReason" "OrderRejectionReason",
    "paymentSettlementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("orderId")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "settlementId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "status" "SettlementStatus" NOT NULL,
    "txHash" TEXT,
    "providerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("settlementId")
);

-- CreateTable
CREATE TABLE "Event" (
    "eventId" TEXT NOT NULL,
    "eventName" "EventName" NOT NULL,
    "agentId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "status" "EventStatus" NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "key" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Order_agentId_idx" ON "Order"("agentId");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Settlement_agentId_idx" ON "Settlement"("agentId");

-- CreateIndex
CREATE INDEX "Settlement_createdAt_idx" ON "Settlement"("createdAt");

-- CreateIndex
CREATE INDEX "Event_agentId_timestamp_idx" ON "Event"("agentId", "timestamp");

-- CreateIndex
CREATE INDEX "IdempotencyKey_route_idx" ON "IdempotencyKey"("route");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("agentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_paymentSettlementId_fkey" FOREIGN KEY ("paymentSettlementId") REFERENCES "Settlement"("settlementId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("agentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("agentId") ON DELETE CASCADE ON UPDATE CASCADE;
