import { createHmac, randomBytes } from "node:crypto";

export interface SessionClaims {
  sub: string;
  agentId: string;
  ownerAddress: string;
  authMode: "passport";
  tokenType: "access" | "refresh";
  iat: number;
  exp: number;
  jti?: string;
}

export interface SessionPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
}

interface ChallengeRecord {
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
  private readonly refreshTokens = new Map<
    string,
    { ownerAddress: string; agentId: string; expiresAt: number }
  >();

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

  issueSessionPair(input: {
    ownerAddress: string;
    agentId: string;
    accessTtlSeconds: number;
    refreshTtlSeconds: number;
  }): SessionPair {
    const accessToken = this.signToken({
      ownerAddress: input.ownerAddress,
      agentId: input.agentId,
      ttlSeconds: input.accessTtlSeconds,
      tokenType: "access"
    });

    const refreshJti = randomBytes(16).toString("hex");
    const refreshToken = this.signToken({
      ownerAddress: input.ownerAddress,
      agentId: input.agentId,
      ttlSeconds: input.refreshTtlSeconds,
      tokenType: "refresh",
      jti: refreshJti
    });

    const refreshExpiresAt = Date.now() + input.refreshTtlSeconds * 1000;
    this.refreshTokens.set(refreshJti, {
      ownerAddress: input.ownerAddress.toLowerCase(),
      agentId: input.agentId,
      expiresAt: refreshExpiresAt
    });
    this.gc();

    return {
      accessToken,
      refreshToken,
      accessExpiresAt: new Date(Date.now() + input.accessTtlSeconds * 1000).toISOString(),
      refreshExpiresAt: new Date(refreshExpiresAt).toISOString()
    };
  }

  refreshSession(
    refreshToken: string,
    input: { accessTtlSeconds: number; refreshTtlSeconds: number }
  ): SessionPair | null {
    const claims = this.verifyToken(refreshToken, "refresh");
    if (!claims?.jti) return null;

    const stored = this.refreshTokens.get(claims.jti);
    if (!stored) return null;
    if (stored.expiresAt <= Date.now()) {
      this.refreshTokens.delete(claims.jti);
      return null;
    }

    if (
      stored.ownerAddress !== claims.ownerAddress.toLowerCase() ||
      stored.agentId !== claims.agentId
    ) {
      this.refreshTokens.delete(claims.jti);
      return null;
    }

    this.refreshTokens.delete(claims.jti);
    return this.issueSessionPair({
      ownerAddress: claims.ownerAddress,
      agentId: claims.agentId,
      accessTtlSeconds: input.accessTtlSeconds,
      refreshTtlSeconds: input.refreshTtlSeconds
    });
  }

  verifySession(token: string): SessionClaims | null {
    return this.verifyToken(token, "access");
  }

  verifyToken(token: string, expectedType?: "access" | "refresh"): SessionClaims | null {
    const now = Math.floor(Date.now() / 1000);
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const signed = `${header}.${payload}`;
    const expected = this.sign(signed);
    if (signature !== expected) return null;

    try {
      const parsed = JSON.parse(base64UrlDecode(payload)) as Partial<SessionClaims>;
      const tokenType = parsed.tokenType ?? "access";
      if (!parsed.exp || parsed.exp <= Math.floor(Date.now() / 1000)) return null;
      if (!parsed.ownerAddress || !parsed.agentId) return null;
      if (expectedType && tokenType !== expectedType) return null;
      if (tokenType === "refresh" && (!parsed.jti || parsed.jti.length === 0)) return null;

      return {
        sub: parsed.sub ?? parsed.ownerAddress,
        agentId: parsed.agentId,
        ownerAddress: parsed.ownerAddress,
        authMode: "passport",
        tokenType,
        iat: parsed.iat ?? now,
        exp: parsed.exp,
        jti: parsed.jti
      };
    } catch {
      return null;
    }
  }

  private signToken(input: {
    ownerAddress: string;
    agentId: string;
    ttlSeconds: number;
    tokenType: "access" | "refresh";
    jti?: string;
  }): string {
    const now = Math.floor(Date.now() / 1000);
    const claims: SessionClaims = {
      sub: input.ownerAddress,
      agentId: input.agentId,
      ownerAddress: input.ownerAddress.toLowerCase(),
      authMode: "passport",
      tokenType: input.tokenType,
      iat: now,
      exp: now + input.ttlSeconds,
      ...(input.jti ? { jti: input.jti } : {})
    };

    const header = { alg: "HS256", typ: "JWT" };
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(claims));
    const signature = this.sign(`${encodedHeader}.${encodedPayload}`);
    return `${encodedHeader}.${encodedPayload}.${signature}`;
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
    for (const [jti, token] of this.refreshTokens.entries()) {
      if (token.expiresAt <= now) {
        this.refreshTokens.delete(jti);
      }
    }
  }
}
