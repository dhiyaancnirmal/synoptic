import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface AgentSession {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  agentId: string;
  ownerAddress: string;
  linkedPayerAddress?: string;
  readiness?: {
    wallet: "ok" | "missing";
    auth: "ok" | "missing";
    identity: "linked" | "warning";
    lastError?: string;
  };
}

function getSynopticDir(): string {
  return process.env.SYNOPTIC_HOME || join(homedir(), ".synoptic");
}

function getSessionPath(): string {
  return join(getSynopticDir(), "session.json");
}

export function loadSession(): AgentSession | null {
  const path = getSessionPath();
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as AgentSession;
    if (!parsed.accessToken || !parsed.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: AgentSession): void {
  const dir = getSynopticDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = getSessionPath();
  writeFileSync(path, JSON.stringify(session, null, 2), { mode: 0o600 });
  chmodSync(path, 0o600);
}

export function getSessionPathForDisplay(): string {
  return getSessionPath();
}

