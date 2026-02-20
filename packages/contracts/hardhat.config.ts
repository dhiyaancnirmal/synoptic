import { config as loadEnv } from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

loadEnv();

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    kiteTestnet: {
      url: process.env.KITE_TESTNET_RPC ?? "https://rpc-testnet.gokite.ai/",
      chainId: Number(process.env.KITE_CHAIN_ID ?? "2368"),
      accounts: process.env.AGENT_PRIVATE_KEY ? [process.env.AGENT_PRIVATE_KEY] : []
    }
  }
};

export default config;
