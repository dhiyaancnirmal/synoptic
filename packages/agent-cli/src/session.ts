import { chmodSync, existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { z } from "zod";
import { ensureSynopticDir, getSynopticDirPath } from "./wallet.js";

const SessionSchema = z.object({
  version: z.literal(1),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  accessExpiresAt: z.string().datetime(),
  refreshExpiresAt: z.string().datetime(),
  agentId: z.string().min(1),
  ownerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  linkedPayerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  readiness: z.object({
    walletReady: z.boolean(),
    mcpReady: z.boolean(),
    identityLinked: z.boolean(),
    checkedAt: z.string().datetime(),
    lastError: z.string().optional()
  }),
  updatedAt: z.string().datetime()
});

export type SessionData = z.infer<typeof SessionSchema>;

function getSessionFilePath(): string {
  return join(getSynopticDirPath(), "session.json");
}

export function getSessionPath(): string {
  return getSessionFilePath();
}

export function loadSession(): SessionData | null {
  const path = getSessionFilePath();
  if (!existsSync(path)) return null;

  const raw = readFileSync(path, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  return SessionSchema.parse(parsed);
}

export function saveSession(input: Omit<SessionData, "version" | "updatedAt">): SessionData {
  ensureSynopticDir();
  const path = getSessionFilePath();

  const data: SessionData = SessionSchema.parse({
    version: 1,
    ...input,
    updatedAt: new Date().toISOString()
  });

  writeFileSync(path, JSON.stringify(data, null, 2), { mode: 0o600 });
  chmodSync(path, 0o600);
  return data;
}

export function clearSession(): boolean {
  const path = getSessionFilePath();
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}
