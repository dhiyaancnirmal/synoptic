import chalk from "chalk";
import ora from "ora";
import { generateWallet, loadWallet, getWalletPath } from "../wallet.js";
import {
  KITE_FAUCET_URL,
  MONAD_FAUCET_URL,
  KITE_MCP_SETUP_INSTRUCTIONS,
  checkMcpAvailable
} from "../kite-mcp.js";
import { printHeader, printSuccess, printError, printWarning, printInfo } from "../utils/formatting.js";

export interface InitOptions {
  force?: boolean;
}

export async function initCommand(options: InitOptions = {}): Promise<void> {
  printHeader("Synoptic Agent Init");

  const spinner = ora("Checking for existing wallet...").start();

  const existing = loadWallet();
  if (existing && !options.force) {
    spinner.fail("Wallet already exists");
    console.log("");
    printWarning(`Wallet found at ${getWalletPath()}`);
    console.log("");
    console.log(`  Address: ${chalk.green(existing.address)}`);
    console.log("");
    printInfo("Run with --force to overwrite (backup first with export-key)");
    process.exit(1);
  }

  if (existing && options.force) {
    spinner.text = "Overwriting existing wallet...";
  }

  try {
    if (options.force && existing) {
      const { deleteWallet } = await import("../wallet.js");
      deleteWallet();
    }

    spinner.text = "Generating new wallet...";
    const wallet = generateWallet();

    spinner.succeed("Wallet generated successfully");
    console.log("");

    printSuccess("Your agent wallet has been created");
    console.log("");
    console.log(`  ${chalk.dim("Address:")} ${chalk.green(wallet.address)}`);
    console.log(`  ${chalk.dim("Stored:")} ${chalk.dim(getWalletPath())}`);
    console.log("");

    printHeader("Next Steps");

    console.log("  1. Fund your wallet on both chains:");
    console.log("");
    console.log(`     ${chalk.cyan("Kite Testnet:")}`);
    console.log(`     ${chalk.blue(KITE_FAUCET_URL)}`);
    console.log(`     Address: ${wallet.address}`);
    console.log("");
    console.log(`     ${chalk.cyan("Monad Testnet:")}`);
    console.log(`     ${chalk.blue(MONAD_FAUCET_URL)}`);
    console.log(`     Address: ${wallet.address}`);
    console.log("");

    const mcpStatus = checkMcpAvailable();
    if (!mcpStatus) {
      console.log("  2. Configure Kite MCP for x402 payments:");
      console.log("");
      console.log(KITE_MCP_SETUP_INSTRUCTIONS);
      console.log("");
    } else {
      console.log("  2. Kite MCP configured ✓");
      console.log("");
    }

    console.log("  3. Run setup/auth/session flow:");
    console.log(`     ${chalk.dim("$")} npx @synoptic/agent setup`);
    console.log("");

    console.log("  4. Check funding status:");
    console.log(`     ${chalk.dim("$")} npx @synoptic/agent fund`);
    console.log("");

    console.log("  5. Start autonomous trading:");
    console.log(`     ${chalk.dim("$")} npx @synoptic/agent start`);
    console.log("");

    console.log(`  ${chalk.dim("For help:")} npx @synoptic/agent --help`);
    console.log("");
  } catch (error) {
    spinner.fail("Failed to generate wallet");
    printError(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
