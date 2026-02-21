import { Wallet } from "ethers";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  readdirSync,
  statSync,
  unlinkSync
} from "fs";
import { join } from "path";
import { homedir } from "os";
import type { WalletData } from "./types.js";
import { WalletSchema } from "./types.js";

function getSynopticDir(): string {
  return process.env.SYNOPTIC_HOME || join(homedir(), ".synoptic");
}

function getWalletFile(): string {
  return join(getSynopticDir(), "wallet.json");
}

function getLogsDirPath(): string {
  return join(getSynopticDir(), "logs");
}

function getConfigFilePath(): string {
  return join(getSynopticDir(), "config.json");
}

export function ensureSynopticDir(): void {
  const dir = getSynopticDir();
  const logsDir = getLogsDirPath();

  if (!existsSync(dir)) {
    mkdirSync(dir, { mode: 0o700, recursive: true });
  }
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { mode: 0o700, recursive: true });
  }
}

export function generateWallet(): WalletData {
  ensureSynopticDir();

  const walletFile = getWalletFile();

  if (existsSync(walletFile)) {
    throw new Error(
      "Wallet already exists. Use --force to overwrite or run `export-key` to backup."
    );
  }

  const wallet = Wallet.createRandom();
  const data: WalletData = {
    version: 1,
    address: wallet.address,
    privateKey: wallet.privateKey,
    createdAt: new Date().toISOString(),
    chains: {
      kite: { chainId: 2368, rpc: "https://rpc-testnet.gokite.ai/" },
      monad: { chainId: 143, rpc: "https://rpc.monad.xyz" },
      monadTestnet: { chainId: 10143, rpc: "https://testnet-rpc.monad.xyz" }
    }
  };

  writeFileSync(walletFile, JSON.stringify(data, null, 2), { mode: 0o600 });
  chmodSync(walletFile, 0o600);

  return data;
}

export function loadWallet(): WalletData | null {
  const walletFile = getWalletFile();

  if (!existsSync(walletFile)) {
    return null;
  }

  const raw = readFileSync(walletFile, "utf-8");
  const parsed = JSON.parse(raw);
  return WalletSchema.parse(parsed);
}

export function deleteWallet(): boolean {
  const walletFile = getWalletFile();

  if (!existsSync(walletFile)) {
    return false;
  }
  unlinkSync(walletFile);
  return true;
}

export function getWalletPath(): string {
  return getWalletFile();
}

export function getLogsDir(): string {
  return getLogsDirPath();
}

export function getSynopticDirPath(): string {
  return getSynopticDir();
}

export function rotateLogs(maxFiles: number = 10): void {
  ensureSynopticDir();

  const logsDir = getLogsDirPath();

  const files = readdirSync(logsDir)
    .filter((f) => f.endsWith(".log"))
    .map((f) => ({
      name: f,
      path: join(logsDir, f),
      mtime: statSync(join(logsDir, f)).mtime.getTime()
    }))
    .sort((a, b) => b.mtime - a.mtime);

  for (let i = maxFiles; i < files.length; i++) {
    unlinkSync(files[i].path);
  }
}

export function getCurrentLogFile(): string {
  const date = new Date().toISOString().split("T")[0];
  return join(getLogsDirPath(), `agent-${date}.log`);
}

export const SYNAPTIC_DIR = getSynopticDir();
export const WALLET_FILE = getWalletFile();
export const CONFIG_FILE = getConfigFilePath();
