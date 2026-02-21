import { createHmac, randomBytes } from "node:crypto";

export interface SessionClaims {
  sub: string;
  agentId: string;
  ownerAddress: string;
  authMode: "passport";
  tokenType: "access" | "refresh";
  jti: string;
  iat: number;
  exp: number;
}

export interface ChallengeRecord {
  id: string;
  nonce: string;
  message: string;
  ownerAddress: string;
  agentId: string;
  expiresAt: number;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

export class SessionAuth {
  private readonly challenges = new Map<string, ChallengeRecord>();
  private readonly revokedRefreshJti = new Set<string>();

  constructor(private readonly secret: string) { }

  createChallenge(input: {
    domain: string;
    uri: string;
    chainId: number;
    ownerAddress: string;
    agentId: string;
    ttlMs: number;
  }): ChallengeRecord {
    const now = Date.now();
    const nonce = randomBytes(16).toString("hex");
    const id = randomBytes(16).toString("hex");
    const expiresAt = now + input.ttlMs;
    const issuedAtIso = new Date(now).toISOString();
    const expiresAtIso = new Date(expiresAt).toISOString();

    const message =
      `synoptic wants you to sign in with your wallet\n` +
      `Domain: ${input.domain}\n` +
      `URI: ${input.uri}\n` +
      `Chain ID: ${input.chainId}\n` +
      `Nonce: ${nonce}\n` +
      `Issued At: ${issuedAtIso}\n` +
      `Expiration Time: ${expiresAtIso}\n` +
      `Agent ID: ${input.agentId}\n` +
      `Owner Address: ${input.ownerAddress}`;

    const challenge: ChallengeRecord = {
      id,
      nonce,
      message,
      ownerAddress: input.ownerAddress,
      agentId: input.agentId,
      expiresAt
    };
    this.challenges.set(id, challenge);
    this.gc();
    return challenge;
  }

  consumeChallenge(id: string): ChallengeRecord | undefined {
    const challenge = this.challenges.get(id);
    if (!challenge) return undefined;
    this.challenges.delete(id);
    if (challenge.expiresAt <= Date.now()) return undefined;
    return challenge;
  }

  signSession(input: {
    ownerAddress: string;
    agentId: string;
    ttlSeconds: number;
  }): string {
    return this.signToken({
      ownerAddress: input.ownerAddress,
      agentId: input.agentId,
      ttlSeconds: input.ttlSeconds,
      tokenType: "access"
    });
  }

  signAccessSession(input: {
    ownerAddress: string;
    agentId: string;
    ttlSeconds: number;
  }): string {
    return this.signToken({ ...input, tokenType: "access" });
  }

  signRefreshSession(input: {
    ownerAddress: string;
    agentId: string;
    ttlSeconds: number;
  }): string {
    return this.signToken({ ...input, tokenType: "refresh" });
  }

  issueTokenPair(input: {
    ownerAddress: string;
    agentId: string;
    accessTtlSeconds: number;
    refreshTtlSeconds: number;
  }): { accessToken: string; refreshToken: string } {
    return {
      accessToken: this.signAccessSession({
        ownerAddress: input.ownerAddress,
        agentId: input.agentId,
        ttlSeconds: input.accessTtlSeconds
      }),
      refreshToken: this.signRefreshSession({
        ownerAddress: input.ownerAddress,
        agentId: input.agentId,
        ttlSeconds: input.refreshTtlSeconds
      })
    };
  }

  rotateRefreshToken(input: {
    refreshToken: string;
    accessTtlSeconds: number;
    refreshTtlSeconds: number;
  }): { accessToken: string; refreshToken: string; claims: SessionClaims } | null {
    const refreshClaims = this.verifyToken(input.refreshToken, "refresh");
    if (!refreshClaims) return null;
    this.revokedRefreshJti.add(refreshClaims.jti);
    const nextPair = this.issueTokenPair({
      ownerAddress: refreshClaims.ownerAddress,
      agentId: refreshClaims.agentId,
      accessTtlSeconds: input.accessTtlSeconds,
      refreshTtlSeconds: input.refreshTtlSeconds
    });
    return { ...nextPair, claims: refreshClaims };
  }

  verifySession(token: string): SessionClaims | null {
    return this.verifyToken(token, "access");
  }

  verifyAccessSession(token: string): SessionClaims | null {
    return this.verifyToken(token, "access");
  }

  verifyRefreshSession(token: string): SessionClaims | null {
    return this.verifyToken(token, "refresh");
  }

  private signToken(input: {
    ownerAddress: string;
    agentId: string;
    ttlSeconds: number;
    tokenType: "access" | "refresh";
  }): string {
    const now = Math.floor(Date.now() / 1000);
    const claims: SessionClaims = {
      sub: input.ownerAddress.toLowerCase(),
      agentId: input.agentId,
      ownerAddress: input.ownerAddress.toLowerCase(),
      authMode: "passport",
      tokenType: input.tokenType,
      jti: randomBytes(16).toString("hex"),
      iat: now,
      exp: now + input.ttlSeconds
    };

    const header = { alg: "HS256", typ: "JWT" };
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(claims));
    const signature = this.sign(`${encodedHeader}.${encodedPayload}`);
    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  private verifyToken(token: string, expectedType: "access" | "refresh"): SessionClaims | null {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const signed = `${header}.${payload}`;
    const expected = this.sign(signed);
    if (signature !== expected) return null;

    try {
      const parsed = JSON.parse(base64UrlDecode(payload)) as SessionClaims;
      if (!parsed.exp || parsed.exp <= Math.floor(Date.now() / 1000)) return null;
      if (!parsed.ownerAddress || !parsed.agentId) return null;
      if (!parsed.tokenType || parsed.tokenType !== expectedType) return null;
      if (!parsed.jti || parsed.jti.length === 0) return null;
      if (expectedType === "refresh" && this.revokedRefreshJti.has(parsed.jti)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private sign(value: string): string {
    return createHmac("sha256", this.secret).update(value).digest("base64url");
  }

  private gc(): void {
    const now = Date.now();
    for (const [id, challenge] of this.challenges.entries()) {
      if (challenge.expiresAt <= now) {
        this.challenges.delete(id);
      }
    }
  }
}
