import type { TransactionRequest } from "ethers";
import { JsonRpcProvider, Wallet } from "ethers";
import { validateUnsignedTxData } from "./execution.js";

export interface SwapExecutionResult {
  txHash: string;
}

function toBigIntOrUndefined(value?: string): bigint | undefined {
  if (!value) return undefined;
  return BigInt(value);
}

export async function signAndBroadcastSwap(input: {
  wallet: Wallet;
  provider: JsonRpcProvider;
  unsignedTx: {
    to: string;
    data: string;
    value?: string;
    chainId?: number;
    gasLimit?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
  };
}): Promise<SwapExecutionResult> {
  if (!validateUnsignedTxData(input.unsignedTx.data)) {
    throw new Error("Invalid swap transaction data");
  }

  const signer = input.wallet.connect(input.provider);
  const txRequest: TransactionRequest = {
    to: input.unsignedTx.to,
    data: input.unsignedTx.data,
    value: toBigIntOrUndefined(input.unsignedTx.value),
    chainId: input.unsignedTx.chainId,
    gasLimit: toBigIntOrUndefined(input.unsignedTx.gasLimit),
    maxFeePerGas: toBigIntOrUndefined(input.unsignedTx.maxFeePerGas),
    maxPriorityFeePerGas: toBigIntOrUndefined(input.unsignedTx.maxPriorityFeePerGas)
  };

  const tx = await signer.sendTransaction(txRequest);
  await tx.wait(1);
  return { txHash: tx.hash };
}
