import { JsonRpcProvider, Wallet } from "ethers";
import type { TradingAdapter, UnsignedTransaction } from "../adapters/contracts.js";
import { UniswapClient } from "./uniswap-client.js";
import type { UniswapQuoteResponse } from "./uniswap-types.js";
import { signAndBroadcastSwap } from "./swap-executor.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function pickAmountOut(quote: UniswapQuoteResponse): string {
  if (isObject(quote.quote) && isObject(quote.quote.output) && typeof quote.quote.output.amount === "string") {
    return quote.quote.output.amount;
  }
  if (isObject(quote.classicQuote) && typeof quote.classicQuote.outputAmount === "string") {
    return quote.classicQuote.outputAmount;
  }
  return "0";
}

function prepareSwapRequest(
  quoteResponse: Record<string, unknown>,
  signature?: string
): Record<string, unknown> {
  const request: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(quoteResponse)) {
    if (value !== null && value !== undefined) {
      request[key] = value;
    }
  }
  if (signature) {
    request.signature = signature;
  }
  return request;
}

interface ApprovalContext {
  walletAddress: string;
  token: string;
  amount: string;
  chainId: number;
  requestId?: string;
}

export class RealTradingAdapter implements TradingAdapter {
  private readonly wallet: Wallet;
  private readonly provider: JsonRpcProvider;
  private readonly client: UniswapClient;
  private lastApprovalContext?: ApprovalContext;
  private readonly quotedRequestIds = new Set<string>();

  constructor(input: { privateKey: string; executionRpcUrl: string; uniswapApiKey: string }) {
    this.wallet = new Wallet(input.privateKey);
    this.provider = new JsonRpcProvider(input.executionRpcUrl);
    this.client = new UniswapClient(input.uniswapApiKey);
  }

  async checkApproval(input: {
    walletAddress: string;
    token: string;
    amount: string;
    chainId: number;
  }): Promise<{ needsApproval: boolean; approvalTx?: UnsignedTransaction; approvalRequestId?: string }> {
    const response = await this.client.checkApproval({
      walletAddress: input.walletAddress,
      token: input.token,
      amount: input.amount,
      chainId: input.chainId
    });
    this.lastApprovalContext = {
      walletAddress: input.walletAddress,
      token: input.token,
      amount: input.amount,
      chainId: input.chainId,
      requestId: response.requestId
    };

    if (!response.approval) {
      return { needsApproval: false, approvalRequestId: response.requestId };
    }

    const approvalTx: UnsignedTransaction = response.approval;
    return { needsApproval: true, approvalTx, approvalRequestId: response.requestId };
  }

  async quote(input: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    chainId: number;
    swapper: string;
  }): Promise<{ quoteResponse: Record<string, unknown>; amountOut: string }> {
    const approval = this.lastApprovalContext;
    if (
      !approval ||
      approval.walletAddress.toLowerCase() !== input.swapper.toLowerCase() ||
      approval.token.toLowerCase() !== input.tokenIn.toLowerCase() ||
      approval.amount !== input.amountIn ||
      approval.chainId !== input.chainId
    ) {
      throw new Error("Uniswap flow violation: call checkApproval before quote for the same wallet/token/amount/chain");
    }

    const response = await this.client.quote({
      tokenIn: input.tokenIn,
      tokenOut: input.tokenOut,
      tokenInChainId: String(input.chainId),
      tokenOutChainId: String(input.chainId),
      type: "EXACT_INPUT",
      amount: input.amountIn,
      swapper: input.swapper
    });
    if (response.requestId) {
      this.quotedRequestIds.add(response.requestId);
    }

    const quoteResponse = response as unknown as Record<string, unknown>;
    return {
      quoteResponse,
      amountOut: pickAmountOut(response)
    };
  }

  async executeSwap(input: {
    quoteResponse: Record<string, unknown>;
    signature?: string;
  }): Promise<{ txHash: string; status: "broadcast" | "confirmed"; quoteRequestId?: string; swapRequestId?: string }> {
    const quoteRequestId = typeof input.quoteResponse.requestId === "string" ? input.quoteResponse.requestId : undefined;
    if (!quoteRequestId || !this.quotedRequestIds.has(quoteRequestId)) {
      throw new Error("Uniswap flow violation: executeSwap requires a quoteResponse returned by quote()");
    }

    const swapResponse = await this.client.swap(prepareSwapRequest(input.quoteResponse, input.signature));
    this.quotedRequestIds.delete(quoteRequestId);
    const result = await signAndBroadcastSwap({
      wallet: this.wallet,
      provider: this.provider,
      unsignedTx: swapResponse.swap
    });
    return {
      txHash: result.txHash,
      status: "confirmed",
      quoteRequestId,
      swapRequestId: swapResponse.requestId
    };
  }
}
