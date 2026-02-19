import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import "hardhat-deploy";
import { config as loadEnv } from "dotenv";
import type { HardhatUserConfig } from "hardhat/config";

loadEnv();

const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
const verifyRequested = process.argv.includes("--verify");

if (verifyRequested && !process.env.KITESCAN_API_KEY) {
  throw new Error("KITESCAN_API_KEY is required when using --verify.");
}

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  defaultNetwork: "hardhat",
  networks: {
    kite_testnet: {
      url: process.env.KITE_RPC_URL ?? "https://rpc-testnet.gokite.ai/",
      chainId: Number(process.env.KITE_CHAIN_ID ?? "2368"),
      accounts: privateKey ? [privateKey] : []
    }
  },
  etherscan: {
    apiKey: {
      kite_testnet: process.env.KITESCAN_API_KEY ?? ""
    }
  }
};

export default config;
