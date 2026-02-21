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
  amount?: string;
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

interface DecodedTransferCall {
  recipient?: string;
  amount?: string;
}

const ERC20_TRANSFER_SIG = "0xa9059cbb";

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

function isErc20Transfer(input?: string): boolean {
  return typeof input === "string" && input.toLowerCase().startsWith(ERC20_TRANSFER_SIG);
}

function extractSelector(input?: string): string | undefined {
  if (typeof input !== "string") return undefined;
  if (!input.startsWith("0x") || input.length < 10) return undefined;
  return input.slice(0, 10).toLowerCase();
}

function decodeErc20TransferCalldata(input?: string): DecodedTransferCall {
  if (!isErc20Transfer(input)) return {};
  if (typeof input !== "string") return {};
  const normalized = input.startsWith("0x") ? input.slice(2) : input;
  const payload = normalized.slice(8); // skip selector
  if (payload.length < 128) return {};
  const recipientWord = payload.slice(0, 64);
  const amountWord = payload.slice(64, 128);
  try {
    const recipient = `0x${recipientWord.slice(24)}`.toLowerCase();
    const amount = BigInt(`0x${amountWord}`).toString(10);
    return { recipient, amount };
  } catch {
    return {};
  }
}

function isContractDeployment(tx: QuickNodeTransaction): boolean {
  return tx.to === null || tx.to === undefined;
}

async function processBlock(
  block: QuickNodeBlockLike,
  store: RuntimeStoreContract
): Promise<{
  blockNumber: number;
  transferCount: number;
  deploymentCount: number;
  selectorsExtracted: number;
}> {
  const blockNumber = toDecimalNumber(block.number);
  if (blockNumber === undefined) {
    return { blockNumber: 0, transferCount: 0, deploymentCount: 0, selectorsExtracted: 0 };
  }

  const txCount = block.transactionCount ?? block.transactions?.length ?? 0;
  let transferCount = 0;
  let deploymentCount = 0;
  let selectorsExtracted = 0;

  const selectorStats = new Map<string, number>();
  const contractCalls = new Map<string, { callers: Set<string>; txCount: number; gasUsed: bigint }>();

  const transactions = Array.isArray(block.transactions) ? block.transactions : [];
  for (const tx of transactions) {
    if (!tx.hash) continue;

    const selector = extractSelector(tx.input);
    if (selector) {
      selectorStats.set(selector, (selectorStats.get(selector) ?? 0) + 1);
      selectorsExtracted += 1;
    }

    if (isErc20Transfer(tx.input) && tx.to) {
      const decoded = decodeErc20TransferCalldata(tx.input);
      await store.insertDerivedTransfer({
        blockNumber,
        txHash: tx.hash,
        logIndex: 0,
        fromAddress: tx.from ?? "",
        toAddress: decoded.recipient ?? tx.to,
        tokenAddress: tx.to,
        amount: decoded.amount
      });
      transferCount += 1;
    }

    if (isContractDeployment(tx)) {
      deploymentCount += 1;
      if (tx.contractAddress) {
        const key = tx.contractAddress.toLowerCase();
        const existing = contractCalls.get(key) ?? {
          callers: new Set<string>(),
          txCount: 0,
          gasUsed: 0n
        };
        existing.txCount += 1;
        if (tx.from) existing.callers.add(tx.from.toLowerCase());
        contractCalls.set(key, existing);
      }
    }

    if (tx.to) {
      const key = tx.to.toLowerCase();
      const existing = contractCalls.get(key) ?? {
        callers: new Set<string>(),
        txCount: 0,
        gasUsed: 0n
      };
      existing.txCount += 1;
      if (tx.from) existing.callers.add(tx.from.toLowerCase());
      if (tx.gasUsed) {
        try {
          existing.gasUsed += BigInt(tx.gasUsed);
        } catch {
          // ignore malformed gas value
        }
      }
      contractCalls.set(key, existing);
    }
  }

  if (Array.isArray(block.transfers)) {
    for (const transfer of block.transfers) {
      if (!transfer.txHash || !transfer.from) continue;
      const decoded = decodeErc20TransferCalldata(transfer.input);
      await store.insertDerivedTransfer({
        blockNumber,
        txHash: transfer.txHash,
        logIndex: transferCount,
        fromAddress: transfer.from,
        toAddress: transfer.to ?? decoded.recipient ?? transfer.tokenContract ?? "",
        tokenAddress: transfer.tokenContract ?? "",
        amount: transfer.amount ?? decoded.amount
      });
      transferCount += 1;
    }
  }

  if (Array.isArray(block.deployments)) {
    for (const deployment of block.deployments) {
      deploymentCount += 1;
      if (!deployment.contractAddress) continue;
      await store.upsertContractActivity({
        contractAddress: deployment.contractAddress.toLowerCase(),
        blockStart: blockNumber,
        blockEnd: blockNumber,
        txCount: 1,
        uniqueCallers: deployment.deployer ? 1 : 0,
        failedTxCount: 0
      });
    }
  }

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

  const methodSelectors = Array.from(selectorStats.entries()).map(([selector, count]) => ({
    selector,
    count
  }));

  await store.upsertStreamBlock({
    blockNumber,
    blockHash: block.hash,
    parentHash: block.parentHash,
    timestamp: toDecimalNumber(block.timestamp),
    transactionCount: txCount,
    gasUsed: toDecimalString(block.gasUsed),
    gasLimit: toDecimalString(block.gasLimit),
    rawPayload: {
      ...(block as Record<string, unknown>),
      methodSelectors
    }
  });

  return { blockNumber, transferCount, deploymentCount, selectorsExtracted };
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
    const blocks = Array.isArray(payload.data) ? payload.data : [];

    let totalTransfers = 0;
    let totalDeployments = 0;
    let totalSelectors = 0;
    let lastBlockNumber: number | undefined;

    for (const block of blocks) {
      const result = await processBlock(block, options.store);
      if (result.blockNumber > 0) {
        lastBlockNumber = result.blockNumber;
        totalTransfers += result.transferCount;
        totalDeployments += result.deploymentCount;
        totalSelectors += result.selectorsExtracted;
      }
    }

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
      selectorsExtracted: totalSelectors,
      payloadSizeBytes: JSON.stringify(payload).length
    });

    options.wsHub.broadcast({ type: "activity.new", event });
    return reply.status(200).send({
      ok: true,
      received: true,
      blocksProcessed: blocks.length,
      lastBlockNumber,
      transfersExtracted: totalTransfers,
      deploymentsDetected: totalDeployments,
      selectorsExtracted: totalSelectors
    });
  });
}
