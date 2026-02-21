import { Contract, JsonRpcProvider, Wallet } from "ethers";
import type { AttestationAdapter } from "../adapters/contracts.js";

const SERVICE_REGISTRY_ABI = [
  "function recordService((string serviceType, uint256 paymentAmount, bytes32 paymentTxHash, uint256 targetChainId, string targetTxHashOrRef, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, string metadata) input)"
];

const LEGACY_TRADE_REGISTRY_ABI = [
  "function recordTrade(uint256 sourceChainId, bytes32 sourceTxHash, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, string strategyReason)"
];

const ZERO_BYTES32 = `0x${"0".repeat(64)}`;

function toBytes32(hexHash: string): string {
  const normalized = hexHash.startsWith("0x") ? hexHash.slice(2) : hexHash;
  if (!/^[0-9a-fA-F]*$/.test(normalized)) {
    throw new Error("sourceTxHash is not hex and cannot be encoded to bytes32");
  }
  if (normalized.length > 64) {
    throw new Error("sourceTxHash exceeds bytes32 length");
  }
  return `0x${normalized.padStart(64, "0")}`;
}

function normalizeAddress(address: string): string {
  return address.toLowerCase() === "eth"
    ? "0x0000000000000000000000000000000000000000"
    : address;
}

export class RealAttestationAdapter implements AttestationAdapter {
  private readonly wallet: Wallet;
  private readonly provider: JsonRpcProvider;
  private readonly registryAddress: string;

  constructor(input: {
    privateKey: string;
    kiteRpcUrl: string;
    serviceRegistryAddress?: string;
    tradeRegistryAddress?: string;
  }) {
    this.wallet = new Wallet(input.privateKey);
    this.provider = new JsonRpcProvider(input.kiteRpcUrl);
    const resolvedAddress = input.serviceRegistryAddress ?? input.tradeRegistryAddress;
    if (!resolvedAddress) {
      throw new Error("serviceRegistryAddress or tradeRegistryAddress is required");
    }
    this.registryAddress = resolvedAddress;
  }

  async recordService(input: {
    serviceType: string;
    sourceChainId: number;
    sourceTxHashOrRef: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOut: string;
    metadata: string;
  }): Promise<{ attestationTxHash: string }> {
    const signer = this.wallet.connect(this.provider);
    const serviceRegistry = new Contract(this.registryAddress, SERVICE_REGISTRY_ABI, signer);
    const tx = await serviceRegistry.recordService({
      serviceType: input.serviceType,
      paymentAmount: 0n,
      paymentTxHash: ZERO_BYTES32,
      targetChainId: BigInt(input.sourceChainId),
      targetTxHashOrRef: input.sourceTxHashOrRef,
      tokenIn: normalizeAddress(input.tokenIn),
      tokenOut: normalizeAddress(input.tokenOut),
      amountIn: BigInt(input.amountIn),
      amountOut: BigInt(input.amountOut),
      metadata: input.metadata
    });

    await tx.wait(1);
    return { attestationTxHash: tx.hash as string };
  }

  async recordTrade(input: {
    sourceChainId: number;
    sourceTxHash: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOut: string;
    strategyReason: string;
  }): Promise<{ attestationTxHash: string }> {
    try {
      return await this.recordService({
        serviceType: "trade_execute",
        sourceChainId: input.sourceChainId,
        sourceTxHashOrRef: input.sourceTxHash,
        tokenIn: input.tokenIn,
        tokenOut: input.tokenOut,
        amountIn: input.amountIn,
        amountOut: input.amountOut,
        metadata: input.strategyReason
      });
    } catch {
      const signer = this.wallet.connect(this.provider);
      const legacyTradeRegistry = new Contract(this.registryAddress, LEGACY_TRADE_REGISTRY_ABI, signer);
      const tx = await legacyTradeRegistry.recordTrade(
      BigInt(input.sourceChainId),
      toBytes32(input.sourceTxHash),
      normalizeAddress(input.tokenIn),
      normalizeAddress(input.tokenOut),
      BigInt(input.amountIn),
      BigInt(input.amountOut),
      input.strategyReason
      );

      await tx.wait(1);
      return { attestationTxHash: tx.hash as string };
    }
  }
}
