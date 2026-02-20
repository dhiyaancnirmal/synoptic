import { Wallet } from "ethers";

export function getWalletFromPrivateKey(privateKey: string): Wallet {
  if (!privateKey || privateKey.trim().length === 0) {
    throw new Error("AGENT_PRIVATE_KEY is required");
  }
  return new Wallet(privateKey);
}
