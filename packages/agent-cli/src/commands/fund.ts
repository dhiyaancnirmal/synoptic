import chalk from "chalk";
import ora from "ora";
import { JsonRpcProvider, formatEther } from "ethers";
import { loadWallet } from "../wallet.js";
import { KITE_FAUCET_URL, MONAD_FAUCET_URL } from "../kite-mcp.js";
import { printHeader, printSuccess, printError, printWarning } from "../utils/formatting.js";

export interface FundOptions {
  watch?: boolean;
}

async function getBalance(rpcUrl: string, address: string): Promise<string> {
  try {
    const provider = new JsonRpcProvider(rpcUrl);
    const balance = await provider.getBalance(address);
    return formatEther(balance);
  } catch {
    return "0";
  }
}

export async function fundCommand(options: FundOptions = {}): Promise<void> {
  printHeader("Wallet Funding Status");

  const spinner = ora("Loading wallet...").start();

  const wallet = loadWallet();
  if (!wallet) {
    spinner.fail("No wallet found");
    console.log("");
    printError("Run `npx @synoptic/agent init` first");
    process.exit(1);
  }

  spinner.succeed("Wallet loaded");
  console.log("");

  console.log(`  ${chalk.dim("Address:")} ${chalk.green(wallet.address)}`);
  console.log("");

  const kiteSpinner = ora("Checking Kite balance...").start();
  const kiteBalance = await getBalance(wallet.chains.kite.rpc, wallet.address);
  kiteSpinner.succeed(`Kite: ${chalk.cyan(kiteBalance)} KITE`);

  const monadSpinner = ora("Checking Monad balance...").start();
  const monadBalance = await getBalance(wallet.chains.monad.rpc, wallet.address);
  monadSpinner.succeed(`Monad: ${chalk.cyan(monadBalance)} MON`);

  console.log("");

  const kiteHasFunds = parseFloat(kiteBalance) > 0;
  const monadHasFunds = parseFloat(monadBalance) > 0;

  if (kiteHasFunds && monadHasFunds) {
    printSuccess("Wallet is funded on both chains");
    console.log("");
    console.log(`  Ready to trade! Run ${chalk.dim("npx @synoptic/agent start")}`);
    console.log("");
    return;
  }

  printWarning("Wallet needs funding");
  console.log("");

  if (!kiteHasFunds) {
    console.log(`  ${chalk.cyan("Kite Testnet:")}`);
    console.log(`  ${chalk.blue(KITE_FAUCET_URL)}`);
    console.log(`  Address: ${wallet.address}`);
    console.log("");
  }

  if (!monadHasFunds) {
    console.log(`  ${chalk.cyan("Monad Testnet:")}`);
    console.log(`  ${chalk.blue(MONAD_FAUCET_URL)}`);
    console.log(`  Address: ${wallet.address}`);
    console.log("");
  }

  if (options.watch) {
    console.log("  Watching for funding... (Ctrl+C to stop)");
    console.log("");

    while (!kiteHasFunds || !monadHasFunds) {
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const newKite = await getBalance(wallet.chains.kite.rpc, wallet.address);
      const newMonad = await getBalance(wallet.chains.monad.rpc, wallet.address);

      process.stdout.write(
        `\r  Kite: ${chalk.cyan(newKite.padEnd(12))} MONAD: ${chalk.cyan(newMonad.padEnd(12))}`
      );

      if (parseFloat(newKite) > 0 && parseFloat(newMonad) > 0) {
        console.log("");
        console.log("");
        printSuccess("Wallet funded!");
        return;
      }
    }
  } else {
    console.log(`  Run with ${chalk.dim("--watch")} to monitor funding automatically`);
    console.log("");
  }
}
