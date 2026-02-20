import type { FastifyInstance } from "fastify";
import { fail, ok } from "../http/envelope.js";
import type { RuntimeStoreContract } from "../state/runtime-store.js";
import { loadEnv } from "../env.js";
import { JsonRpcProvider, Contract } from "ethers";

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

interface HoldingToken {
  symbol: string;
  tokenAddress: string;
  decimals: number;
  isNative: boolean;
}

function getTrackedTokens(): HoldingToken[] {
  const env = loadEnv();
  const tokens: HoldingToken[] = [
    { symbol: "MON", tokenAddress: ZERO_ADDRESS, decimals: 18, isNative: true }
  ];

  if (env.monadUsdcAddress) {
    tokens.push({
      symbol: "USDC",
      tokenAddress: env.monadUsdcAddress,
      decimals: 6,
      isNative: false
    });
  }

  if (env.monadUsdtAddress) {
    tokens.push({
      symbol: "USDT",
      tokenAddress: env.monadUsdtAddress,
      decimals: 6,
      isNative: false
    });
  }

  return tokens;
}

let cachedProvider: JsonRpcProvider | null = null;

function getProvider(): JsonRpcProvider | null {
  const env = loadEnv();
  if (!cachedProvider && env.executionRpcUrl) {
    cachedProvider = new JsonRpcProvider(env.executionRpcUrl);
  }
  return cachedProvider;
}

interface HoldingResult {
  symbol: string;
  tokenAddress: string;
  decimals: number;
  balance: string;
  error?: string;
}

async function fetchNativeBalance(
  provider: JsonRpcProvider,
  address: string
): Promise<HoldingResult> {
  try {
    const balance = await provider.getBalance(address);
    return { symbol: "MON", tokenAddress: ZERO_ADDRESS, decimals: 18, balance: balance.toString() };
  } catch (err) {
    return {
      symbol: "MON",
      tokenAddress: ZERO_ADDRESS,
      decimals: 18,
      balance: "0",
      error: err instanceof Error ? err.message : "failed to fetch native balance"
    };
  }
}

async function fetchErc20Balance(
  provider: JsonRpcProvider,
  address: string,
  tokenAddress: string
): Promise<HoldingResult> {
  try {
    const contract = new Contract(tokenAddress, ERC20_ABI, provider);
    const [balanceRaw, decimals, symbol] = await Promise.all([
      contract.balanceOf(address),
      contract.decimals(),
      contract.symbol()
    ]);
    return { symbol, tokenAddress, decimals: Number(decimals), balance: balanceRaw.toString() };
  } catch (err) {
    return {
      symbol: "UNKNOWN",
      tokenAddress,
      decimals: 0,
      balance: "0",
      error: err instanceof Error ? err.message : "failed to fetch ERC20 balance"
    };
  }
}

export async function registerHoldingsRoutes(
  app: FastifyInstance,
  store: RuntimeStoreContract
): Promise<void> {
  app.get("/api/agents/:agentId/holdings", async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const env = loadEnv();

    const agent = await store.getAgent(agentId);
    if (!agent) {
      fail(request, reply, 404, "NOT_FOUND", "Agent not found", { agentId });
      return;
    }

    const walletAddress = agent.eoaAddress;
    if (!walletAddress || walletAddress === ZERO_ADDRESS) {
      return ok(request, {
        agentId,
        asOf: new Date().toISOString(),
        chainId: env.executionChainId,
        chain: env.executionChainName,
        walletAddress: walletAddress || "",
        holdings: [],
        totals: {}
      });
    }

    const provider = getProvider();
    if (!provider) {
      return ok(request, {
        agentId,
        asOf: new Date().toISOString(),
        chainId: env.executionChainId,
        chain: env.executionChainName,
        walletAddress,
        holdings: [],
        totals: {},
        warnings: ["RPC not configured, cannot fetch balances"]
      });
    }

    const tokens = getTrackedTokens();
    const results: HoldingResult[] = [];

    for (const token of tokens) {
      if (token.isNative) {
        results.push(await fetchNativeBalance(provider, walletAddress));
      } else {
        results.push(await fetchErc20Balance(provider, walletAddress, token.tokenAddress));
      }
    }

    const successfulHoldings = results
      .filter((r) => !r.error)
      .map((r) => ({
        symbol: r.symbol,
        tokenAddress: r.tokenAddress,
        decimals: r.decimals,
        balance: r.balance
      }));

    const warnings = results.filter((r) => r.error).map((r) => `${r.symbol}: ${r.error}`);

    return ok(request, {
      agentId,
      asOf: new Date().toISOString(),
      chainId: env.executionChainId,
      chain: env.executionChainName,
      walletAddress,
      holdings: successfulHoldings,
      totals: {},
      ...(warnings.length > 0 && { warnings })
    });
  });
}
