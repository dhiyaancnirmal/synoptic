import chalk from "chalk";

export function formatAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatBalance(balance: string, symbol: string): string {
  const num = parseFloat(balance);
  if (isNaN(num)) return `${balance} ${symbol}`;
  return `${num.toFixed(4)} ${symbol}`;
}

export function formatTxHash(hash: string, explorerUrl: string): string {
  return `${explorerUrl}/tx/${hash}`;
}

export function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString();
}

export function printHeader(title: string): void {
  console.log("");
  console.log(chalk.bold.blue(`═══ ${title} ═══`));
  console.log("");
}

export function printKeyValue(key: string, value: string): void {
  console.log(`  ${chalk.dim(key)}: ${chalk.white(value)}`);
}

export function printSuccess(message: string): void {
  console.log(chalk.green(`  ✓ ${message}`));
}

export function printError(message: string): void {
  console.log(chalk.red(`  ✗ ${message}`));
}

export function printWarning(message: string): void {
  console.log(chalk.yellow(`  ⚠ ${message}`));
}

export function printInfo(message: string): void {
  console.log(chalk.blue(`  ℹ ${message}`));
}
