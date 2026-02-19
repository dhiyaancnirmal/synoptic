import { type Address, createPublicClient, http, parseAbiItem } from "viem";
import type { ApiContext } from "../context.js";
import { publishEvent } from "./events.js";

export interface EventIndexer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createEventIndexer(context: ApiContext): EventIndexer | null {
  const registryAddress = context.config.SYNOPTIC_REGISTRY_ADDRESS as Address | undefined;
  const marketplaceAddress = context.config.SYNOPTIC_MARKETPLACE_ADDRESS as Address | undefined;

  if (!registryAddress || !marketplaceAddress) {
    context.logger.info("Event indexer disabled (missing SYNOPTIC_REGISTRY_ADDRESS or SYNOPTIC_MARKETPLACE_ADDRESS)");
    return null;
  }

  const client = createPublicClient({
    transport: http(context.config.KITE_RPC_URL)
  });

  const unsubscribers: Array<() => void> = [];

  return {
    async start() {
      const unwatchRegistry = client.watchContractEvent({
        address: registryAddress,
        abi: [parseAbiItem("event AgentRegistered(string indexed agentId, address indexed owner)")],
        eventName: "AgentRegistered",
        onLogs: async (logs) => {
          for (const log of logs) {
            const args = (log as any).args as { agentId?: string; owner?: Address };
            if (!args.agentId || !args.owner) continue;

            await context.prisma.agent.upsert({
              where: { agentId: args.agentId },
              update: { ownerAddress: args.owner, status: "ACTIVE" },
              create: {
                agentId: args.agentId,
                ownerAddress: args.owner,
                status: "ACTIVE"
              }
            });

            await publishEvent(context, {
              eventName: "agent.created",
              agentId: args.agentId,
              status: "SUCCESS",
              metadata: {
                ownerAddress: args.owner,
                txHash: log.transactionHash
              }
            });
          }
        }
      });

      const unwatchMarketplace = client.watchContractEvent({
        address: marketplaceAddress,
        abi: [parseAbiItem("event OrderSubmitted(string indexed orderId, string indexed agentId)")],
        eventName: "OrderSubmitted",
        onLogs: async (logs) => {
          for (const log of logs) {
            const args = (log as any).args as { orderId?: string; agentId?: string };
            if (!args.orderId || !args.agentId) continue;

            await context.prisma.order.upsert({
              where: { orderId: args.orderId },
              update: {},
              create: {
                orderId: args.orderId,
                agentId: args.agentId,
                status: "EXECUTED",
                venueType: "SPOT",
                marketId: "ONCHAIN",
                side: "BUY",
                size: "0"
              }
            });

            await publishEvent(context, {
              eventName: "trade.executed",
              agentId: args.agentId,
              status: "SUCCESS",
              metadata: {
                orderId: args.orderId,
                source: "onchain",
                txHash: log.transactionHash
              }
            });
          }
        }
      });

      const unwatchVaultRules = client.watchContractEvent({
        address: marketplaceAddress,
        abi: [parseAbiItem("event SpendRuleUpdated(string indexed agentId, uint256 perTxLimit, uint256 dailyLimit)")],
        eventName: "SpendRuleUpdated",
        onLogs: async (logs) => {
          for (const log of logs) {
            const args = (log as any).args as { agentId?: string; perTxLimit?: bigint; dailyLimit?: bigint };
            if (!args.agentId || args.perTxLimit === undefined || args.dailyLimit === undefined) continue;

            await context.prisma.riskRule.upsert({
              where: { agentId: args.agentId },
              update: {
                perTxLimit: args.perTxLimit.toString(),
                dailyLimit: args.dailyLimit.toString(),
                lastResetDate: new Date()
              },
              create: {
                agentId: args.agentId,
                perTxLimit: args.perTxLimit.toString(),
                dailyLimit: args.dailyLimit.toString(),
                dailySpent: "0",
                lastResetDate: new Date()
              }
            });
          }
        }
      });

      unsubscribers.push(unwatchRegistry, unwatchMarketplace, unwatchVaultRules);
      context.logger.info(
        {
          registryAddress,
          marketplaceAddress
        },
        "Event indexer started"
      );
    },
    async stop() {
      for (const unsubscribe of unsubscribers.splice(0, unsubscribers.length)) {
        unsubscribe();
      }
      context.logger.info("Event indexer stopped");
    }
  };
}
