import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RuntimeStoreContract } from "../state/runtime-store.js";
import { WsHub } from "../ws/hub.js";

interface QuickNodeWebhookOptions {
  store: RuntimeStoreContract;
  wsHub: WsHub;
  securityToken?: string;
}

interface QuickNodeTransfer {
  txHash?: string;
  from?: string;
  to?: string;
  tokenContract?: string;
  input?: string;
  blockNumber?: number | string;
}

interface QuickNodeDeployment {
  txHash?: string;
  deployer?: string;
  contractAddress?: string;
  blockNumber?: number | string;
}

interface QuickNodeTransaction {
  hash?: string;
  from?: string;
  to?: string | null;
  input?: string;
  contractAddress?: string;
  gasUsed?: string;
}

interface QuickNodeBlockLike {
  number?: string | number;
  hash?: string;
  parentHash?: string;
  timestamp?: string | number;
  gasUsed?: string | number;
  gasLimit?: string | number;
  transactionCount?: number;
  transactions?: QuickNodeTransaction[];
  transfers?: QuickNodeTransfer[];
  deployments?: QuickNodeDeployment[];
}

interface QuickNodeWebhookBody {
  data?: QuickNodeBlockLike[];
  [key: string]: unknown;
}

function extractToken(headers: FastifyRequest["headers"]): string | undefined {
  const quickNodeToken = headers["x-quicknode-token"];
  if (typeof quickNodeToken === "string" && quickNodeToken.trim()) {
    return quickNodeToken.trim();
  }
  const quickNodeSecret = headers["x-quicknode-secret"];
  if (typeof quickNodeSecret === "string" && quickNodeSecret.trim()) {
    return quickNodeSecret.trim();
  }
  const auth = headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length).trim();
  }
  return undefined;
}

function toDecimalNumber(value: string | number | undefined): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return undefined;
  if (value.startsWith("0x")) {
    try {
      return Number(BigInt(value));
    } catch {
      return undefined;
    }
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function toDecimalString(value: string | number | undefined): string | undefined {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return undefined;
  if (value.startsWith("0x")) {
    try {
      return BigInt(value).toString(10);
    } catch {
      return value;
    }
  }
  return value;
}

const ERC20_TRANSFER_SIG = "0xa9059cbb";

function isErc20Transfer(input?: string): boolean {
  return typeof input === "string" && input.toLowerCase().startsWith(ERC20_TRANSFER_SIG);
}

function isContractDeployment(tx: QuickNodeTransaction): boolean {
  return tx.to === null || tx.to === undefined;
}

async function processBlock(
  block: QuickNodeBlockLike,
  store: RuntimeStoreContract
): Promise<{ blockNumber: number; transferCount: number; deploymentCount: number }> {
  const blockNumber = toDecimalNumber(block.number);
  if (blockNumber === undefined) {
    return { blockNumber: 0, transferCount: 0, deploymentCount: 0 };
  }

  const txCount = block.transactionCount ?? block.transactions?.length ?? 0;

  await store.upsertStreamBlock({
    blockNumber,
    blockHash: block.hash,
    parentHash: block.parentHash,
    timestamp: toDecimalNumber(block.timestamp),
    transactionCount: txCount,
    gasUsed: toDecimalString(block.gasUsed),
    gasLimit: toDecimalString(block.gasLimit),
    rawPayload: block as unknown as Record<string, unknown>
  });

  let transferCount = 0;
  let deploymentCount = 0;

  // Process pre-extracted transfers (from filter function)
  if (block.transfers && Array.isArray(block.transfers)) {
    for (const transfer of block.transfers) {
      if (!transfer.txHash || !transfer.from) continue;
      await store.insertDerivedTransfer({
        blockNumber,
        txHash: transfer.txHash,
        logIndex: transferCount,
        fromAddress: transfer.from,
        toAddress: transfer.to ?? transfer.tokenContract ?? "",
        tokenAddress: transfer.tokenContract ?? "",
        amount: undefined
      });
      transferCount++;
    }
  }

  // Process raw transactions if available
  const contractCalls = new Map<string, { callers: Set<string>; txCount: number; gasUsed: bigint }>();

  if (block.transactions && Array.isArray(block.transactions)) {
    for (const tx of block.transactions) {
      if (!tx.hash) continue;

      // ERC-20 transfers from raw txs
      if (isErc20Transfer(tx.input) && tx.to) {
        await store.insertDerivedTransfer({
          blockNumber,
          txHash: tx.hash,
          logIndex: 0,
          fromAddress: tx.from ?? "",
          toAddress: tx.to,
          tokenAddress: tx.to,
          amount: undefined
        });
        transferCount++;
      }

      // Contract deployments
      if (isContractDeployment(tx)) {
        deploymentCount++;
        if (tx.contractAddress) {
          const existing = contractCalls.get(tx.contractAddress) ?? {
            callers: new Set<string>(),
            txCount: 0,
            gasUsed: 0n
          };
          existing.txCount++;
          if (tx.from) existing.callers.add(tx.from);
          contractCalls.set(tx.contractAddress, existing);
        }
      }

      // Track per-contract activity
      if (tx.to) {
        const existing = contractCalls.get(tx.to) ?? {
          callers: new Set<string>(),
          txCount: 0,
          gasUsed: 0n
        };
        existing.txCount++;
        if (tx.from) existing.callers.add(tx.from);
        if (tx.gasUsed) {
          try {
            existing.gasUsed += BigInt(tx.gasUsed);
          } catch { /* ignore */ }
        }
        contractCalls.set(tx.to, existing);
      }
    }

    // Upsert contract activity
    for (const [address, stats] of contractCalls) {
      await store.upsertContractActivity({
        contractAddress: address,
        blockStart: blockNumber,
        blockEnd: blockNumber,
        txCount: stats.txCount,
        uniqueCallers: stats.callers.size,
        failedTxCount: 0,
        totalGasUsed: stats.gasUsed.toString()
      });
    }
  }

  // Process pre-extracted deployments (from filter function)
  if (block.deployments && Array.isArray(block.deployments)) {
    for (const dep of block.deployments) {
      deploymentCount++;
      if (dep.contractAddress) {
        await store.upsertContractActivity({
          contractAddress: dep.contractAddress,
          blockStart: blockNumber,
          blockEnd: blockNumber,
          txCount: 1,
          uniqueCallers: dep.deployer ? 1 : 0,
          failedTxCount: 0
        });
      }
    }
  }

  return { blockNumber, transferCount, deploymentCount };
}

export async function registerQuickNodeWebhookRoutes(
  app: FastifyInstance,
  options: QuickNodeWebhookOptions
): Promise<void> {
  app.get("/webhooks/quicknode/monad", async () => ({
    ok: true,
    provider: "quicknode",
    network: "monad-testnet"
  }));

  app.post("/webhooks/quicknode/monad", async (request, reply) => {
    const configuredToken = options.securityToken?.trim();
    if (configuredToken) {
      const token = extractToken(request.headers);
      if (token !== configuredToken) {
        return reply.status(401).send({
          code: "QUICKNODE_UNAUTHORIZED",
          message: "Invalid QuickNode webhook token"
        });
      }
    }

    const payload = (request.body ?? {}) as QuickNodeWebhookBody;
    const blocks = payload.data ?? [];

    let totalTransfers = 0;
    let totalDeployments = 0;
    let lastBlockNumber: number | undefined;

    for (const block of blocks) {
      const result = await processBlock(block, options.store);
      if (result.blockNumber > 0) {
        lastBlockNumber = result.blockNumber;
        totalTransfers += result.transferCount;
        totalDeployments += result.deploymentCount;
      }
    }

    // Emit activity event for dashboard (keep existing behavior)
    const firstBlock = blocks[0];
    const blockNumber = toDecimalString(firstBlock?.number);
    const blockHash = firstBlock?.hash;

    const agents = await options.store.listAgents();
    const agent = agents[0] ?? (await options.store.createAgent({ name: "Webhook Agent", status: "idle" }));
    const event = await options.store.addActivity(agent.id, "quicknode.block.received", "monad", {
      dataset: "block_with_receipts",
      blockNumber,
      blockHash,
      parentHash: firstBlock?.parentHash,
      timestamp: firstBlock?.timestamp,
      blocksProcessed: blocks.length,
      transfersExtracted: totalTransfers,
      deploymentsDetected: totalDeployments,
      payloadSizeBytes: JSON.stringify(payload).length
    });

    options.wsHub.broadcast({ type: "activity.new", event });
    return reply.status(200).send({
      ok: true,
      received: true,
      blocksProcessed: blocks.length,
      lastBlockNumber,
      transfersExtracted: totalTransfers,
      deploymentsDetected: totalDeployments
    });
  });
}
