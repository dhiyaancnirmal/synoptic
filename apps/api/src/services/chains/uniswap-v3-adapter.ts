import { type Address, createPublicClient, createWalletClient, encodeFunctionData, formatUnits, http, parseAbi, parseAbiItem } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
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
}

export interface LiquidityCheckResult {
  ok: boolean;
  poolAddress?: Address;
}

export interface SwapResult {
  txHash: `0x${string}`;
  amountIn: bigint;
  amountOut: bigint;
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

class MockUniswapV3Adapter implements UniswapV3Adapter {
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
      estimatedPrice: Number(formatUnits(amountOut, 18)).toFixed(6)
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
      amountOut
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
      estimatedPrice
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
      amountOut: quote.amountOut
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

export function createUniswapV3Adapter(config: ApiConfig): UniswapV3Adapter {
  if (config.NODE_ENV === "test" || !config.SERVER_SIGNER_PRIVATE_KEY) {
    return new MockUniswapV3Adapter();
  }

  return new LiveUniswapV3Adapter(config);
}
