import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const RPC_URL =
  process.env.NEXT_PUBLIC_MONAD_TESTNET_RPC_URL ??
  process.env.MONAD_TESTNET_RPC_URL ??
  "https://testnet-rpc.monad.xyz";

const CHAIN_ID = 10143;
const BLOCK_WINDOW = 99;
const BUCKETS = 10;
const CACHE_TTL_MS = 45_000;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const MAX_RETRIES = 3;

interface RpcError {
  code?: number;
  message?: string;
}

interface RpcLog {
  address: string;
  blockNumber: string;
}

interface TokenSeries {
  address: string;
  symbol: string;
  decimals: number;
  transferCount: number;
  points: Array<{ time: number; value: number }>;
}

interface CachePayload {
  chainId: number;
  latestBlock: number;
  fromBlock: number;
  generatedAt: string;
  rpcUrl: string;
  tokens: TokenSeries[];
}

let cache: { expiresAt: number; payload: CachePayload } | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimited(error?: RpcError): boolean {
  if (!error?.message) return false;
  const message = error.message.toLowerCase();
  return message.includes("limited") || message.includes("rate");
}

async function rpcRequest<T>(method: string, params: unknown[]): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const response = await fetch(RPC_URL, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now() + attempt, method, params })
    });

    if (!response.ok) {
      throw new Error(`RPC request failed (${response.status})`);
    }

    const payload = (await response.json()) as {
      result?: T;
      error?: RpcError;
    };

    if (!payload.error) {
      if (payload.result === undefined) throw new Error(`RPC response missing result for ${method}`);
      return payload.result;
    }

    if (attempt < MAX_RETRIES && isRateLimited(payload.error)) {
      await sleep((attempt + 1) * 220);
      continue;
    }

    throw new Error(payload.error.message ?? `RPC error for ${method}`);
  }

  throw new Error(`RPC retries exhausted for ${method}`);
}

function toHex(blockNumber: number): string {
  return `0x${blockNumber.toString(16)}`;
}

function decodeStringResult(result: string): string {
  if (!result || result === "0x") return "UNKNOWN";
  const clean = result.slice(2);

  if (clean.length === 64) {
    const bytes = Buffer.from(clean, "hex");
    const zeroIndex = bytes.indexOf(0);
    const raw = bytes.slice(0, zeroIndex === -1 ? bytes.length : zeroIndex);
    const text = raw.toString("utf8").trim();
    return text || "UNKNOWN";
  }

  if (clean.length < 128) return "UNKNOWN";

  try {
    const offset = Number(BigInt(`0x${clean.slice(0, 64)}`));
    const start = offset * 2;
    const len = Number(BigInt(`0x${clean.slice(start, start + 64)}`));
    const valueHex = clean.slice(start + 64, start + 64 + len * 2);
    const text = Buffer.from(valueHex, "hex").toString("utf8").trim();
    return text || "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

async function readSymbol(address: string): Promise<string> {
  const result = await rpcRequest<string>("eth_call", [{ to: address, data: "0x95d89b41" }, "latest"]);
  return decodeStringResult(result);
}

async function readDecimals(address: string): Promise<number> {
  const result = await rpcRequest<string>("eth_call", [{ to: address, data: "0x313ce567" }, "latest"]);
  if (!result || result === "0x") return 18;
  const parsed = Number(BigInt(result));
  return Number.isFinite(parsed) ? parsed : 18;
}

function buildBucketPoints(
  buckets: number[],
  latestBlock: number,
  fromBlock: number,
  nowSeconds: number
): Array<{ time: number; value: number }> {
  const blockSpan = latestBlock - fromBlock + 1;
  const bucketSize = Math.max(1, Math.ceil(blockSpan / BUCKETS));

  return buckets.map((value, idx) => {
    const bucketEndBlock = Math.min(latestBlock, fromBlock + (idx + 1) * bucketSize - 1);
    return {
      time: nowSeconds - (BUCKETS - 1 - idx) * 30,
      value,
      blockNumber: bucketEndBlock
    };
  });
}

async function buildPayload(): Promise<CachePayload> {
  const latestBlockHex = await rpcRequest<string>("eth_blockNumber", []);
  const latestBlock = Number(BigInt(latestBlockHex));
  const fromBlock = Math.max(1, latestBlock - BLOCK_WINDOW);

  const logs = await rpcRequest<RpcLog[]>("eth_getLogs", [
    {
      fromBlock: toHex(fromBlock),
      toBlock: toHex(latestBlock),
      topics: [TRANSFER_TOPIC]
    }
  ]);

  const tokenCounters = new Map<string, { total: number; bucketCounts: number[] }>();
  const blockSpan = latestBlock - fromBlock + 1;
  const bucketSize = Math.max(1, Math.ceil(blockSpan / BUCKETS));

  for (const entry of logs) {
    const token = entry.address.toLowerCase();
    const blockNumber = Number(BigInt(entry.blockNumber));
    const bucketIdx = Math.max(0, Math.min(BUCKETS - 1, Math.floor((blockNumber - fromBlock) / bucketSize)));

    const record = tokenCounters.get(token) ?? { total: 0, bucketCounts: Array.from({ length: BUCKETS }, () => 0) };
    record.total += 1;
    record.bucketCounts[bucketIdx] += 1;
    tokenCounters.set(token, record);
  }

  const topTokens = Array.from(tokenCounters.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10);

  const nowSeconds = Math.floor(Date.now() / 1000);

  const tokens: TokenSeries[] = [];
  for (const [address, stats] of topTokens) {
    const [symbol, decimals] = await Promise.all([readSymbol(address), readDecimals(address)]);

    tokens.push({
      address,
      symbol,
      decimals,
      transferCount: stats.total,
      points: buildBucketPoints(stats.bucketCounts, latestBlock, fromBlock, nowSeconds)
    });

    await sleep(90);
  }

  return {
    chainId: CHAIN_ID,
    latestBlock,
    fromBlock,
    generatedAt: new Date().toISOString(),
    rpcUrl: RPC_URL,
    tokens
  };
}

export async function GET() {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return NextResponse.json(cache.payload, { headers: { "cache-control": "no-store" } });
  }

  try {
    const payload = await buildPayload();
    cache = {
      payload,
      expiresAt: now + CACHE_TTL_MS
    };
    return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
  } catch (cause) {
    return NextResponse.json(
      { message: cause instanceof Error ? cause.message : "Failed to load Monad top tokens" },
      { status: 502 }
    );
  }
}
