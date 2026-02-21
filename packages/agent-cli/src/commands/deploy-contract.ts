import { execSync } from "child_process";
import { resolve } from "path";
import ora from "ora";
import chalk from "chalk";
import { loadWallet } from "../wallet.js";
import { printHeader, printSuccess, printError, printInfo } from "../utils/formatting.js";

export interface DeployContractOptions {
  railway?: boolean;
  service?: string;
}

interface DeployOutput {
  contract: string;
  address: string;
  deployer: string;
  deploymentTxHash: string | null;
  blockNumber: number | null;
  network: string;
  chainId: number;
}

export async function deployContractCommand(options: DeployContractOptions = {}): Promise<void> {
  printHeader("Deploy ServiceRegistry to Kite Testnet");

  const wallet = loadWallet();
  if (!wallet) {
    printError("No wallet found. Run `npx @synoptic/agent init` first.");
    process.exit(1);
  }

  const contractsDir = resolve(__dirname, "../../../../contracts");

  const spinner = ora("Deploying ServiceRegistry to Kite testnet...").start();

  let deployOutput: DeployOutput;
  try {
    const stdout = execSync(
      "npx hardhat run scripts/deploy.ts --network kiteTestnet",
      {
        cwd: contractsDir,
        env: {
          ...process.env,
          AGENT_PRIVATE_KEY: wallet.privateKey
        },
        stdio: "pipe",
        timeout: 120_000
      }
    ).toString();

    // The deploy script outputs JSON on stdout
    const jsonLine = stdout.trim().split("\n").pop() ?? "";
    deployOutput = JSON.parse(jsonLine);
    spinner.succeed("ServiceRegistry deployed");
  } catch (error) {
    spinner.fail("Deployment failed");
    printError(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  console.log("");
  printSuccess(`Contract: ${deployOutput.contract}`);
  printSuccess(`Address:  ${chalk.green(deployOutput.address)}`);
  printSuccess(`Network:  ${deployOutput.network} (chain ${deployOutput.chainId})`);
  if (deployOutput.deploymentTxHash) {
    printInfo(`Tx: https://testnet.kitescan.ai/tx/${deployOutput.deploymentTxHash}`);
  }
  console.log("");

  if (options.railway) {
    const railwaySpinner = ora("Pushing SERVICE_REGISTRY_ADDRESS to Railway...").start();
    try {
      const args = ["variables", "set", `SERVICE_REGISTRY_ADDRESS=${deployOutput.address}`];
      if (options.service) {
        args.push("--service", options.service);
      }
      execSync(`railway ${args.join(" ")}`, {
        stdio: "pipe",
        timeout: 30_000
      });
      railwaySpinner.succeed("SERVICE_REGISTRY_ADDRESS set on Railway");
    } catch (error) {
      railwaySpinner.fail("Failed to set Railway variable");
      printError(error instanceof Error ? error.message : String(error));
      printInfo(`Set it manually: railway variables set SERVICE_REGISTRY_ADDRESS=${deployOutput.address}`);
    }
  } else {
    printInfo("Tip: use --railway to auto-push the address to Railway");
  }

  console.log("");
}
