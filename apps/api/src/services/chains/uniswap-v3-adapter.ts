import {
  type Address,
  type Hex,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatUnits,
  http,
  parseAbi,
  parseAbiItem
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import type { ExecutionSource } from "@synoptic/types/rest";
import type { ApiConfig } from "../../config.js";

const erc20Abi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)"
]);

const v3FactoryAbi = parseAbi(["function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)"]);
const v3PoolAbi = parseAbi([
  "function liquidity() view returns (uint128)",
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)"
]);
const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) view returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)"
]);
const routerAbi = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)"
]);

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

interface UniswapApiQuoteEnvelope {
  quote?: unknown;
  requestId?: string;
  routing?: string;
  [key: string]: unknown;
}

interface UniswapApiSwapEnvelope {
  swap?: {
    to?: string;
    data?: string;
    value?: string;
    gasLimit?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
  };
  requestId?: string;
  [key: string]: unknown;
}

export interface QuoteParams {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  fee: number;
}

export interface QuoteResult {
  amountOut: bigint;
  poolAddress: Address;
  priceImpactBps: number;
  estimatedPrice: string;
  source: ExecutionSource;
  quoteRequestId?: string;
  routing?: string;
}

export interface LiquidityCheckResult {
  ok: boolean;
  poolAddress?: Address;
}

export interface SwapResult {
  txHash: `0x${string}`;
  amountIn: bigint;
  amountOut: bigint;
  source: ExecutionSource;
  quoteRequestId?: string;
  swapRequestId?: string;
  routing?: string;
}

export interface UniswapV3Adapter {
  readBalance(token: Address, owner: Address): Promise<bigint>;
  checkPoolLiquidity(params: { tokenIn: Address; tokenOut: Address; fee: number }): Promise<LiquidityCheckResult>;
  quoteExactInputSingle(params: QuoteParams): Promise<QuoteResult>;
  executeExactInputSingle(params: {
    tokenIn: Address;
    tokenOut: Address;
    amountIn: bigint;
    fee: number;
    slippageBps: number;
    deadlineSeconds: number;
    recipient: Address;
  }): Promise<SwapResult>;
  findRecentTransferTx(params: { token: Address; recipient: Address; minValue: bigint; fromBlock: bigint }): Promise<`0x${string}` | undefined>;
}

class SimulatedUniswapV3Adapter implements UniswapV3Adapter {
  async readBalance(): Promise<bigint> {
    return 10_000_000_000_000_000_000n;
  }

  async checkPoolLiquidity(): Promise<LiquidityCheckResult> {
    return { ok: true, poolAddress: "0x1111111111111111111111111111111111111111" };
  }

  async quoteExactInputSingle(params: QuoteParams): Promise<QuoteResult> {
    const amountOut = (params.amountIn * 997n) / 1000n;
    return {
      amountOut,
      poolAddress: "0x1111111111111111111111111111111111111111",
      priceImpactBps: 30,
      estimatedPrice: Number(formatUnits(amountOut, 18)).toFixed(6),
      source: "DIRECT_VIEM"
    };
  }

  async executeExactInputSingle(params: {
    tokenIn: Address;
    tokenOut: Address;
    amountIn: bigint;
    fee: number;
    slippageBps: number;
    deadlineSeconds: number;
    recipient: Address;
  }): Promise<SwapResult> {
    const amountOut = (params.amountIn * 995n) / 1000n;
    return {
      txHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
      amountIn: params.amountIn,
      amountOut,
      source: "DIRECT_VIEM"
    };
  }

  async findRecentTransferTx(): Promise<`0x${string}` | undefined> {
    return "0x3333333333333333333333333333333333333333333333333333333333333333";
  }
}

class LiveUniswapV3Adapter implements UniswapV3Adapter {
  private readonly account;
  private readonly client;
  private readonly wallet;

  constructor(private readonly config: ApiConfig) {
    this.account = privateKeyToAccount(config.SERVER_SIGNER_PRIVATE_KEY as `0x${string}`);
    this.client = createPublicClient({
      chain: baseSepolia,
      transport: http(config.BASE_SEPOLIA_RPC_URL)
    });
    this.wallet = createWalletClient({
      account: this.account,
      chain: baseSepolia,
      transport: http(config.BASE_SEPOLIA_RPC_URL)
    });
  }

  async readBalance(token: Address, owner: Address): Promise<bigint> {
    return this.client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
  }

  async checkPoolLiquidity(params: { tokenIn: Address; tokenOut: Address; fee: number }): Promise<LiquidityCheckResult> {
    const poolAddress = (await this.client.readContract({
      address: this.config.BASE_UNISWAP_V3_FACTORY as Address,
      abi: v3FactoryAbi,
      functionName: "getPool",
      args: [params.tokenIn, params.tokenOut, params.fee]
    })) as Address;

    if (!poolAddress || /^0x0+$/i.test(poolAddress)) {
      return { ok: false };
    }

    const liquidity = (await this.client.readContract({ address: poolAddress, abi: v3PoolAbi, functionName: "liquidity" })) as bigint;
    const slot0 = (await this.client.readContract({ address: poolAddress, abi: v3PoolAbi, functionName: "slot0" })) as readonly [bigint, number, number, number, number, number, boolean];
    const sqrtPriceX96 = slot0[0];

    if (liquidity === 0n || sqrtPriceX96 === 0n) {
      return { ok: false, poolAddress };
    }

    return { ok: true, poolAddress };
  }

  async quoteExactInputSingle(params: QuoteParams): Promise<QuoteResult> {
    const pool = await this.checkPoolLiquidity({ tokenIn: params.tokenIn, tokenOut: params.tokenOut, fee: params.fee });
    if (!pool.ok || !pool.poolAddress) {
      throw new Error("LIQUIDITY_UNAVAILABLE");
    }

    const [amountOut] = (await this.client.readContract({
      address: this.config.BASE_UNISWAP_QUOTER_V2 as Address,
      abi: quoterAbi,
      functionName: "quoteExactInputSingle",
      args: [
        {
          tokenIn: params.tokenIn,
          tokenOut: params.tokenOut,
          amountIn: params.amountIn,
          fee: params.fee,
          sqrtPriceLimitX96: 0n
        }
      ]
    })) as readonly [bigint, bigint, number, bigint];

    const decimalsIn = (await this.client.readContract({ address: params.tokenIn, abi: erc20Abi, functionName: "decimals" })) as number;
    const decimalsOut = (await this.client.readContract({ address: params.tokenOut, abi: erc20Abi, functionName: "decimals" })) as number;
    const inValue = Number(formatUnits(params.amountIn, decimalsIn));
    const outValue = Number(formatUnits(amountOut, decimalsOut));
    const estimatedPrice = inValue > 0 ? (outValue / inValue).toFixed(6) : "0";

    return {
      amountOut,
      poolAddress: pool.poolAddress,
      priceImpactBps: 50,
      estimatedPrice,
      source: "DIRECT_VIEM"
    };
  }

  async executeExactInputSingle(params: {
    tokenIn: Address;
    tokenOut: Address;
    amountIn: bigint;
    fee: number;
    slippageBps: number;
    deadlineSeconds: number;
    recipient: Address;
  }): Promise<SwapResult> {
    const allowance = (await this.client.readContract({
      address: params.tokenIn,
      abi: erc20Abi,
      functionName: "allowance",
      args: [this.account.address, this.config.BASE_UNISWAP_V3_ROUTER as Address]
    })) as bigint;

    if (allowance < params.amountIn) {
      const approveHash = await this.wallet.writeContract({
        address: params.tokenIn,
        abi: erc20Abi,
        functionName: "approve",
        args: [this.config.BASE_UNISWAP_V3_ROUTER as Address, params.amountIn]
      });
      await this.client.waitForTransactionReceipt({ hash: approveHash, confirmations: 1 });
    }

    const quote = await this.quoteExactInputSingle({
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountIn: params.amountIn,
      fee: params.fee
    });

    const minOut = (quote.amountOut * BigInt(10_000 - params.slippageBps)) / 10_000n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + params.deadlineSeconds);

    const data = encodeFunctionData({
      abi: routerAbi,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: params.tokenIn,
          tokenOut: params.tokenOut,
          fee: params.fee,
          recipient: params.recipient,
          deadline,
          amountIn: params.amountIn,
          amountOutMinimum: minOut,
          sqrtPriceLimitX96: 0n
        }
      ]
    });

    const txHash = await this.wallet.sendTransaction({
      to: this.config.BASE_UNISWAP_V3_ROUTER as Address,
      data,
      value: 0n
    });

    const receipt = await this.client.waitForTransactionReceipt({ hash: txHash, confirmations: 2 });
    if (receipt.status !== "success") {
      throw new Error("SWAP_REVERTED");
    }

    return {
      txHash,
      amountIn: params.amountIn,
      amountOut: quote.amountOut,
      source: "DIRECT_VIEM"
    };
  }

  async findRecentTransferTx(params: { token: Address; recipient: Address; minValue: bigint; fromBlock: bigint }): Promise<`0x${string}` | undefined> {
    const latest = await this.client.getBlockNumber();
    if (latest < params.fromBlock) {
      return undefined;
    }

    const logs = await this.client.getLogs({
      address: params.token,
      event: transferEvent,
      args: { to: params.recipient },
      fromBlock: params.fromBlock,
      toBlock: latest
    });

    const match = [...logs].reverse().find((log) => (log.args.value ?? 0n) >= params.minValue);
    return match?.transactionHash;
  }
}

class ApiBackedUniswapV3Adapter implements UniswapV3Adapter {
  private readonly account;
  private readonly client;
  private readonly wallet;

  constructor(private readonly config: ApiConfig) {
    this.account = privateKeyToAccount(config.SERVER_SIGNER_PRIVATE_KEY as `0x${string}`);
    this.client = createPublicClient({
      chain: baseSepolia,
      transport: http(config.BASE_SEPOLIA_RPC_URL)
    });
    this.wallet = createWalletClient({
      account: this.account,
      chain: baseSepolia,
      transport: http(config.BASE_SEPOLIA_RPC_URL)
    });
  }

  async readBalance(token: Address, owner: Address): Promise<bigint> {
    return this.client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
  }

  async checkPoolLiquidity(params: { tokenIn: Address; tokenOut: Address; fee: number }): Promise<LiquidityCheckResult> {
    void params;
    return {
      ok: true,
      poolAddress: this.config.BASE_UNISWAP_V3_FACTORY as Address
    };
  }

  async quoteExactInputSingle(params: QuoteParams): Promise<QuoteResult> {
    const quoteResponse = await this.requestQuote(params);
    const amountOut = extractAmountOut(quoteResponse);

    if (amountOut === undefined || amountOut <= 0n) {
      throw new Error("LIQUIDITY_UNAVAILABLE");
    }

    const decimalsIn = (await this.client.readContract({ address: params.tokenIn, abi: erc20Abi, functionName: "decimals" })) as number;
    const decimalsOut = (await this.client.readContract({ address: params.tokenOut, abi: erc20Abi, functionName: "decimals" })) as number;
    const inValue = Number(formatUnits(params.amountIn, decimalsIn));
    const outValue = Number(formatUnits(amountOut, decimalsOut));

    return {
      amountOut,
      poolAddress: this.config.BASE_UNISWAP_V3_FACTORY as Address,
      priceImpactBps: 50,
      estimatedPrice: inValue > 0 ? (outValue / inValue).toFixed(6) : "0",
      source: "UNISWAP_API",
      quoteRequestId: quoteResponse.requestId,
      routing: extractRouting(quoteResponse)
    };
  }

  async executeExactInputSingle(params: {
    tokenIn: Address;
    tokenOut: Address;
    amountIn: bigint;
    fee: number;
    slippageBps: number;
    deadlineSeconds: number;
    recipient: Address;
  }): Promise<SwapResult> {
    const quoteResponse = await this.requestQuote(params);
    const quote = quoteResponse.quote ?? quoteResponse;
    const swapResponse = await this.requestSwap({ quote });
    const routing = extractRouting(quoteResponse);

    const txPayload = extractSwapPayload(swapResponse);
    if (!txPayload.to || !txPayload.data) {
      throw new Error("UNISWAP_API_SWAP_MALFORMED");
    }

    const txHash = await this.wallet.sendTransaction({
      to: txPayload.to,
      data: txPayload.data,
      value: toBigInt(txPayload.value) ?? 0n,
      gas: toBigInt(txPayload.gasLimit),
      maxFeePerGas: toBigInt(txPayload.maxFeePerGas),
      maxPriorityFeePerGas: toBigInt(txPayload.maxPriorityFeePerGas)
    });

    const receipt = await this.client.waitForTransactionReceipt({ hash: txHash, confirmations: 2 });
    if (receipt.status !== "success") {
      throw new Error("SWAP_REVERTED");
    }

    const amountOut = extractAmountOut(quoteResponse) ?? 0n;

    return {
      txHash,
      amountIn: params.amountIn,
      amountOut,
      source: "UNISWAP_API",
      quoteRequestId: quoteResponse.requestId,
      swapRequestId: swapResponse.requestId,
      routing
    };
  }

  async findRecentTransferTx(params: { token: Address; recipient: Address; minValue: bigint; fromBlock: bigint }): Promise<`0x${string}` | undefined> {
    const latest = await this.client.getBlockNumber();
    if (latest < params.fromBlock) {
      return undefined;
    }

    const logs = await this.client.getLogs({
      address: params.token,
      event: transferEvent,
      args: { to: params.recipient },
      fromBlock: params.fromBlock,
      toBlock: latest
    });

    const match = [...logs].reverse().find((log) => (log.args.value ?? 0n) >= params.minValue);
    return match?.transactionHash;
  }

  private async requestQuote(params: {
    tokenIn: Address;
    tokenOut: Address;
    amountIn: bigint;
    slippageBps?: number;
  }): Promise<UniswapApiQuoteEnvelope> {
    const payload: Record<string, unknown> = {
      type: "EXACT_INPUT",
      amount: params.amountIn.toString(),
      tokenInChainId: this.config.UNISWAP_API_CHAIN_ID,
      tokenOutChainId: this.config.UNISWAP_API_CHAIN_ID,
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      swapper: this.account.address,
      routingPreference: "BEST_PRICE"
    };

    if (typeof params.slippageBps === "number") {
      payload.slippageTolerance = Number((params.slippageBps / 10_000).toFixed(4));
    }

    const response = await fetch(`${this.config.UNISWAP_API_BASE_URL}/quote`, {
      method: "POST",
      headers: this.uniswapHeaders(),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`UNISWAP_API_QUOTE_FAILED:${response.status}:${body}`);
    }

    return (await response.json()) as UniswapApiQuoteEnvelope;
  }

  private async requestSwap(payload: { quote: unknown }): Promise<UniswapApiSwapEnvelope> {
    const response = await fetch(`${this.config.UNISWAP_API_BASE_URL}/swap`, {
      method: "POST",
      headers: this.uniswapHeaders(),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`UNISWAP_API_SWAP_FAILED:${response.status}:${body}`);
    }

    return (await response.json()) as UniswapApiSwapEnvelope;
  }

  private uniswapHeaders(): Record<string, string> {
    return {
      "content-type": "application/json",
      "x-api-key": this.config.UNISWAP_API_KEY as string
    };
  }
}

class FallbackUniswapAdapter implements UniswapV3Adapter {
  constructor(
    private readonly primary: UniswapV3Adapter,
    private readonly fallback: UniswapV3Adapter,
    private readonly mode: "api" | "api_fallback"
  ) {}

  async readBalance(token: Address, owner: Address): Promise<bigint> {
    return this.primary.readBalance(token, owner);
  }

  async checkPoolLiquidity(params: { tokenIn: Address; tokenOut: Address; fee: number }): Promise<LiquidityCheckResult> {
    return this.withFallback(() => this.primary.checkPoolLiquidity(params), () => this.fallback.checkPoolLiquidity(params));
  }

  async quoteExactInputSingle(params: QuoteParams): Promise<QuoteResult> {
    return this.withFallback(() => this.primary.quoteExactInputSingle(params), () => this.fallback.quoteExactInputSingle(params));
  }

  async executeExactInputSingle(params: {
    tokenIn: Address;
    tokenOut: Address;
    amountIn: bigint;
    fee: number;
    slippageBps: number;
    deadlineSeconds: number;
    recipient: Address;
  }): Promise<SwapResult> {
    return this.withFallback(() => this.primary.executeExactInputSingle(params), () => this.fallback.executeExactInputSingle(params));
  }

  async findRecentTransferTx(params: { token: Address; recipient: Address; minValue: bigint; fromBlock: bigint }): Promise<`0x${string}` | undefined> {
    return this.primary.findRecentTransferTx(params);
  }

  private async withFallback<T>(primaryFn: () => Promise<T>, fallbackFn: () => Promise<T>): Promise<T> {
    try {
      return await primaryFn();
    } catch (error) {
      if (this.mode === "api") {
        throw error;
      }
      return fallbackFn();
    }
  }
}

function extractAmountOut(payload: unknown): bigint | undefined {
  const record = payload as Record<string, unknown>;
  const quote = ((record?.quote as Record<string, unknown> | undefined) ?? record) as Record<string, unknown>;

  const direct = toBigInt(quote.outputAmount) ?? toBigInt(quote.amountOut);
  if (direct !== undefined) {
    return direct;
  }

  const outputs = quote.aggregatedOutputs;
  if (Array.isArray(outputs) && outputs.length > 0) {
    const first = outputs[0] as Record<string, unknown>;
    return toBigInt(first.amount);
  }

  return undefined;
}

function extractRouting(payload: unknown): string | undefined {
  const record = payload as Record<string, unknown>;
  const quote = (record?.quote as Record<string, unknown> | undefined) ?? undefined;
  const routing =
    (typeof record?.routing === "string" ? record.routing : undefined) ??
    (typeof quote?.routing === "string" ? quote.routing : undefined);
  return routing;
}

function extractSwapPayload(payload: UniswapApiSwapEnvelope): {
  to?: Address;
  data?: Hex;
  value?: string;
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
} {
  const swap = payload.swap ?? (payload as unknown as UniswapApiSwapEnvelope["swap"]);
  if (!swap) {
    return {};
  }

  return {
    to: isAddress(swap.to) ? (swap.to as Address) : undefined,
    data: isHex(swap.data) ? (swap.data as Hex) : undefined,
    value: swap.value,
    gasLimit: swap.gasLimit,
    maxFeePerGas: swap.maxFeePerGas,
    maxPriorityFeePerGas: swap.maxPriorityFeePerGas
  };
}

function toBigInt(value: unknown): bigint | undefined {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return undefined;
    try {
      return BigInt(normalized);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function isAddress(value: unknown): value is Address {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isHex(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[a-fA-F0-9]*$/.test(value);
}

export function createUniswapV3Adapter(config: ApiConfig): UniswapV3Adapter {
  if (config.NODE_ENV === "test") {
    return new SimulatedUniswapV3Adapter();
  }

  if (!config.SERVER_SIGNER_PRIVATE_KEY) {
    throw new Error("SERVER_SIGNER_PRIVATE_KEY is required for live Uniswap execution");
  }

  const directAdapter = new LiveUniswapV3Adapter(config);

  if (config.UNISWAP_EXECUTION_MODE === "direct" || !config.UNISWAP_API_KEY) {
    return directAdapter;
  }

  const apiAdapter = new ApiBackedUniswapV3Adapter(config);

  if (config.UNISWAP_EXECUTION_MODE === "api") {
    return apiAdapter;
  }

  return new FallbackUniswapAdapter(apiAdapter, directAdapter, "api_fallback");
}
