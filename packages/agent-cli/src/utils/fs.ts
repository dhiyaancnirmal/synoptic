import { existsSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from "fs";

export function ensureDir(path: string, mode: number = 0o755): void {
  if (!existsSync(path)) {
    mkdirSync(path, { mode, recursive: true });
  }
}

export function writeSecureFile(path: string, content: string): void {
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
}

export function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) {
    return null;
  }

  try {
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export function writeJsonFile<T>(path: string, data: T): void {
  writeFileSync(path, JSON.stringify(data, null, 2), { mode: 0o600 });
}
