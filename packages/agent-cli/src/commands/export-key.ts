import chalk from "chalk";
import clipboardy from "clipboardy";
import * as readline from "readline";
import { loadWallet } from "../wallet.js";
import { generateQr } from "../utils/qr.js";
import { printHeader, printSuccess, printError, printWarning } from "../utils/formatting.js";

export interface ExportKeyOptions {
  yes?: boolean;
}

function promptConfirmation(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(chalk.yellow("This will display your private key. Continue? [y/N] "), (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

export async function exportKeyCommand(options: ExportKeyOptions = {}): Promise<void> {
  printHeader("Export Wallet Key");

  const wallet = loadWallet();
  if (!wallet) {
    printError("No wallet found. Run `npx @synoptic/agent init` first");
    process.exit(1);
  }

  console.log("");
  printWarning("WARNING: Never share your private key with anyone.");
  printWarning("Anyone with your private key can control your wallet.");
  console.log("");

  if (!options.yes) {
    const confirmed = await promptConfirmation();
    if (!confirmed) {
      console.log("");
      console.log(chalk.dim("Aborted."));
      process.exit(0);
    }
  }

  console.log("");
  console.log(chalk.bold("═".repeat(60)));
  console.log("");

  console.log(`  ${chalk.dim("Address:")}     ${chalk.green(wallet.address)}`);
  console.log("");
  console.log(`  ${chalk.dim("Private Key:")} ${chalk.yellow(wallet.privateKey)}`);
  console.log("");
  console.log(chalk.bold("═".repeat(60)));
  console.log("");

  try {
    await clipboardy.write(wallet.privateKey);
    printSuccess("Private key copied to clipboard");
  } catch {
    printWarning("Could not copy to clipboard");
  }

  console.log("");
  console.log(chalk.bold("QR Code for MetaMask Import:"));
  console.log("");

  await generateQr(wallet.privateKey, true);

  console.log("");
  console.log(chalk.dim("Scan this QR code with MetaMask mobile to import your wallet."));
  console.log("");
}
