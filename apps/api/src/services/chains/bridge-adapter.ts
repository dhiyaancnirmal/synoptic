import { type Address, createPublicClient, createWalletClient, encodeFunctionData, http, parseAbi, parseAbiItem } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import type { ApiConfig } from "../../config.js";

const erc20Abi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
]);

const bridgeAbi = parseAbi([
  "function send(uint256 _destChainId,address _recipient,uint256 _amount) payable"
]);

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const BRIDGE_POLL_INTERVAL_MS = 2_500;

export interface BridgeEstimate {
  fee: bigint;
}

export interface BridgeSubmission {
  sourceTxHash: `0x${string}`;
  destinationBalanceBefore: bigint;
  destinationWatchFromBlock: bigint;
}

export interface BridgeConfirmation {
  status: "CONFIRMED" | "DELAYED" | "FAILED";
  destinationTxHash?: `0x${string}`;
  failureCode?: "DESTINATION_CREDIT_NOT_FOUND";
}

export interface BridgeAdapter {
  estimate(params: { amount: bigint; sourceToken: Address; destinationChainId: number }): Promise<BridgeEstimate>;
  submitBridge(params: { amount: bigint; sourceToken: Address; destinationToken: Address; recipient: Address; destinationChainId: number }): Promise<BridgeSubmission>;
  waitDestinationCredit(params: {
    amount: bigint;
    destinationToken: Address;
    recipient: Address;
    destinationBalanceBefore: bigint;
    destinationWatchFromBlock: bigint;
    timeoutMs: number;
  }): Promise<BridgeConfirmation>;
}

class MockBridgeAdapter implements BridgeAdapter {
  async estimate(): Promise<BridgeEstimate> {
    return { fee: 0n };
  }

  async submitBridge(): Promise<BridgeSubmission> {
    return {
      sourceTxHash: "0x4444444444444444444444444444444444444444444444444444444444444444",
      destinationBalanceBefore: 0n,
      destinationWatchFromBlock: 0n
    };
  }

  async waitDestinationCredit(): Promise<BridgeConfirmation> {
    return {
      status: "CONFIRMED",
      destinationTxHash: "0x5555555555555555555555555555555555555555555555555555555555555555"
    };
  }
}

class LiveBridgeAdapter implements BridgeAdapter {
  private readonly account;
  private readonly kiteClient;
  private readonly kiteWallet;
  private readonly baseClient;

  constructor(private readonly config: ApiConfig) {
    this.account = privateKeyToAccount(config.SERVER_SIGNER_PRIVATE_KEY as `0x${string}`);
    this.kiteClient = createPublicClient({ transport: http(config.KITE_RPC_URL) });
    this.kiteWallet = createWalletClient({ account: this.account, transport: http(config.KITE_RPC_URL) });
    this.baseClient = createPublicClient({ chain: baseSepolia, transport: http(config.BASE_SEPOLIA_RPC_URL) });
  }

  async estimate(): Promise<BridgeEstimate> {
    return { fee: 0n };
  }

  async submitBridge(params: {
    amount: bigint;
    sourceToken: Address;
    destinationToken: Address;
    recipient: Address;
    destinationChainId: number;
  }): Promise<BridgeSubmission> {
    const allowance = (await this.kiteClient.readContract({
      address: params.sourceToken,
      abi: erc20Abi,
      functionName: "allowance",
      args: [this.account.address, this.config.KITE_BRIDGE_ROUTER as Address]
    })) as bigint;

    if (allowance < params.amount) {
      const approveHash = await this.kiteWallet.writeContract({
        chain: undefined,
        address: params.sourceToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [this.config.KITE_BRIDGE_ROUTER as Address, params.amount]
      });
      await this.kiteClient.waitForTransactionReceipt({ hash: approveHash, confirmations: 1 });
    }

    const destinationBalanceBefore = (await this.baseClient.readContract({
      address: params.destinationToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [params.recipient]
    })) as bigint;

    const destinationWatchFromBlock = await this.baseClient.getBlockNumber();

    const data = encodeFunctionData({
      abi: bridgeAbi,
      functionName: "send",
      args: [BigInt(params.destinationChainId), params.recipient, params.amount]
    });

    const sourceTxHash = await this.kiteWallet.sendTransaction({
      chain: undefined,
      to: this.config.KITE_BRIDGE_ROUTER as Address,
      data,
      value: 0n
    });
    await this.kiteClient.waitForTransactionReceipt({ hash: sourceTxHash, confirmations: 1 });

    return {
      sourceTxHash,
      destinationBalanceBefore,
      destinationWatchFromBlock
    };
  }

  async waitDestinationCredit(params: {
    amount: bigint;
    destinationToken: Address;
    recipient: Address;
    destinationBalanceBefore: bigint;
    destinationWatchFromBlock: bigint;
    timeoutMs: number;
  }): Promise<BridgeConfirmation> {
    const endAt = Date.now() + params.timeoutMs;
    let sawBalanceIncreaseWithoutTransferLog = false;

    while (Date.now() < endAt) {
      const latest = await this.baseClient.getBlockNumber();
      const logs = await this.baseClient.getLogs({
        address: params.destinationToken,
        event: transferEvent,
        args: { to: params.recipient },
        fromBlock: params.destinationWatchFromBlock,
        toBlock: latest
      });
      const matchedTransfer = [...logs].reverse().find((log) => (log.args.value ?? 0n) >= params.amount);

      if (matchedTransfer?.transactionHash) {
        return {
          status: "CONFIRMED",
          destinationTxHash: matchedTransfer.transactionHash
        };
      }

      const currentBalance = (await this.baseClient.readContract({
        address: params.destinationToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [params.recipient]
      })) as bigint;
      if (currentBalance >= params.destinationBalanceBefore + params.amount) {
        sawBalanceIncreaseWithoutTransferLog = true;
      }

      await new Promise((resolve) => setTimeout(resolve, BRIDGE_POLL_INTERVAL_MS));
    }

    if (sawBalanceIncreaseWithoutTransferLog) {
      return { status: "FAILED", failureCode: "DESTINATION_CREDIT_NOT_FOUND" };
    }

    return { status: "DELAYED" };
  }
}

export function createBridgeAdapter(config: ApiConfig): BridgeAdapter {
  if (config.NODE_ENV === "test" || !config.SERVER_SIGNER_PRIVATE_KEY || !config.KITE_BRIDGE_ROUTER) {
    return new MockBridgeAdapter();
  }

  return new LiveBridgeAdapter(config);
}
