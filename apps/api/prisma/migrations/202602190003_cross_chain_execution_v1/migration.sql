-- Extend enums for cross-chain execution outcomes and new event families.
ALTER TYPE "OrderRejectionReason" ADD VALUE IF NOT EXISTS 'LIQUIDITY_UNAVAILABLE';
ALTER TYPE "OrderRejectionReason" ADD VALUE IF NOT EXISTS 'BRIDGE_FAILED';
ALTER TYPE "OrderRejectionReason" ADD VALUE IF NOT EXISTS 'BRIDGE_TIMEOUT';
ALTER TYPE "OrderRejectionReason" ADD VALUE IF NOT EXISTS 'SWAP_REVERTED';
ALTER TYPE "OrderRejectionReason" ADD VALUE IF NOT EXISTS 'UNSUPPORTED_MARKET';

ALTER TYPE "EventName" ADD VALUE IF NOT EXISTS 'BRIDGE_SUBMITTED';
ALTER TYPE "EventName" ADD VALUE IF NOT EXISTS 'BRIDGE_CONFIRMED';
ALTER TYPE "EventName" ADD VALUE IF NOT EXISTS 'BRIDGE_FAILED';
ALTER TYPE "EventName" ADD VALUE IF NOT EXISTS 'TRADE_SWAP_SUBMITTED';
ALTER TYPE "EventName" ADD VALUE IF NOT EXISTS 'TRADE_SWAP_CONFIRMED';
ALTER TYPE "EventName" ADD VALUE IF NOT EXISTS 'TRADE_SWAP_FAILED';

CREATE TYPE "ExecutionIntentStatus" AS ENUM (
  'INTENT_CREATED',
  'QUOTED',
  'RISK_OK',
  'BRIDGE_REQUIRED',
  'BRIDGE_SUBMITTED',
  'BRIDGE_CONFIRMED_DST',
  'SWAP_SUBMITTED',
  'SWAP_CONFIRMED',
  'FAILED'
);

CREATE TABLE "ExecutionIntent" (
  "intentId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "side" "OrderSide" NOT NULL,
  "size" TEXT NOT NULL,
  "status" "ExecutionIntentStatus" NOT NULL,
  "failureCode" TEXT,
  "bridgeSourceTxHash" TEXT,
  "bridgeDestinationTxHash" TEXT,
  "swapTxHash" TEXT,
  "quoteJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExecutionIntent_pkey" PRIMARY KEY ("intentId")
);

CREATE UNIQUE INDEX "ExecutionIntent_idempotencyKey_key" ON "ExecutionIntent"("idempotencyKey");
CREATE INDEX "ExecutionIntent_agentId_createdAt_idx" ON "ExecutionIntent"("agentId", "createdAt");
CREATE INDEX "ExecutionIntent_status_idx" ON "ExecutionIntent"("status");

ALTER TABLE "ExecutionIntent"
ADD CONSTRAINT "ExecutionIntent_agentId_fkey"
FOREIGN KEY ("agentId") REFERENCES "Agent"("agentId") ON DELETE CASCADE ON UPDATE CASCADE;
