import { Contract, JsonRpcProvider, Wallet } from "ethers";
import type { FacilitatorEnv } from "./env.js";
import type { NormalizedPaymentRequest, SettlementClient } from "./types.js";

const KITE_AA_ABI = [
  "function executeTransferWithAuthorization(bytes32 sessionId,(address from,address to,address token,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce) authorization,bytes signature,bytes metadata)"
];

export class SettlementExecutionError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(input: { code: string; message: string; details?: Record<string, unknown> }) {
    super(input.message);
    this.code = input.code;
    this.details = input.details;
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export class KiteSettlementClient implements SettlementClient {
  private readonly provider: JsonRpcProvider;
  private readonly signer?: Wallet;
  private readonly expectedChainId: number;
  private readonly confirmations: number;
  private chainChecked = false;

  constructor(env: FacilitatorEnv) {
    this.provider = new JsonRpcProvider(env.rpcUrl);
    this.signer = env.privateKey ? new Wallet(env.privateKey, this.provider) : undefined;
    this.expectedChainId = env.chainId;
    this.confirmations = env.settleConfirmations;
  }

  private async verifyChainId(): Promise<void> {
    if (this.chainChecked) return;
    const network = await this.provider.getNetwork();
    const chainId = Number(network.chainId);
    if (chainId !== this.expectedChainId) {
      throw new SettlementExecutionError({
        code: "chain_id_mismatch",
        message: `RPC chainId mismatch: expected ${this.expectedChainId}, got ${chainId}`,
        details: { expected: this.expectedChainId, actual: chainId }
      });
    }
    this.chainChecked = true;
  }

  async simulate(input: NormalizedPaymentRequest): Promise<void> {
    await this.verifyChainId();
    const contract = new Contract(input.authorization.from, KITE_AA_ABI, this.provider);
    try {
      await contract.executeTransferWithAuthorization.staticCall(
        input.sessionId,
        {
          from: input.authorization.from,
          to: input.authorization.to,
          token: input.authorization.token,
          value: BigInt(input.authorization.value),
          validAfter: BigInt(input.authorization.validAfter),
          validBefore: BigInt(input.authorization.validBefore),
          nonce: input.authorization.nonce
        },
        input.signature,
        input.metadataBytes
      );
    } catch (error) {
      throw new SettlementExecutionError({
        code: "simulation_failed",
        message: "executeTransferWithAuthorization simulation failed",
        details: { reason: errorMessage(error) }
      });
    }
  }

  async settle(input: NormalizedPaymentRequest): Promise<string> {
    if (!this.signer) {
      throw new SettlementExecutionError({
        code: "missing_private_key",
        message: "FACILITATOR_PRIVATE_KEY is required to settle payments"
      });
    }

    await this.verifyChainId();
    const contract = new Contract(input.authorization.from, KITE_AA_ABI, this.signer);
    try {
      const tx = await contract.executeTransferWithAuthorization(
        input.sessionId,
        {
          from: input.authorization.from,
          to: input.authorization.to,
          token: input.authorization.token,
          value: BigInt(input.authorization.value),
          validAfter: BigInt(input.authorization.validAfter),
          validBefore: BigInt(input.authorization.validBefore),
          nonce: input.authorization.nonce
        },
        input.signature,
        input.metadataBytes
      );
      if (this.confirmations > 0) {
        await tx.wait(this.confirmations);
      }
      return tx.hash;
    } catch (error) {
      throw new SettlementExecutionError({
        code: "settlement_failed",
        message: "executeTransferWithAuthorization transaction failed",
        details: { reason: errorMessage(error) }
      });
    }
  }
}
