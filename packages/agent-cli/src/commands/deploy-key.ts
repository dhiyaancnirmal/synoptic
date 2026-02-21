import { execSync } from "child_process";
import ora from "ora";
import { loadWallet } from "../wallet.js";
import { printHeader, printSuccess, printError, printWarning, formatAddress } from "../utils/formatting.js";

export interface DeployKeyOptions {
  service?: string;
  yes?: boolean;
}

export async function deployKeyCommand(options: DeployKeyOptions = {}): Promise<void> {
  printHeader("Deploy Wallet Key to Railway");

  const wallet = loadWallet();
  if (!wallet) {
    printError("No wallet found. Run `npx @synoptic/agent init` first.");
    process.exit(1);
  }

  if (!options.yes) {
    printWarning("This will set AGENT_PRIVATE_KEY on your Railway service.");
    printWarning(`Wallet: ${formatAddress(wallet.address)}`);
    console.log("");
  }

  const spinner = ora("Pushing AGENT_PRIVATE_KEY to Railway...").start();

  try {
    const args = ["variables", "set", `AGENT_PRIVATE_KEY=${wallet.privateKey}`];
    if (options.service) {
      args.push("--service", options.service);
    }

    execSync(`railway ${args.join(" ")}`, {
      stdio: "pipe",
      timeout: 30_000
    });

    spinner.succeed("AGENT_PRIVATE_KEY set on Railway");
    console.log("");
    printSuccess(`Wallet ${formatAddress(wallet.address)} deployed to Railway`);
    console.log("");
  } catch (error) {
    spinner.fail("Failed to set Railway variable");
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("command not found") || message.includes("ENOENT")) {
      printError("Railway CLI not found. Install it: npm i -g @railway/cli");
    } else if (message.includes("not logged in") || message.includes("unauthorized")) {
      printError("Not logged in to Railway. Run: railway login");
    } else {
      printError(message);
    }
    process.exit(1);
  }
}
