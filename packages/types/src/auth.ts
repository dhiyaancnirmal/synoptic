export interface WalletChallengeResponse {
  challengeId: string;
  nonce: string;
  message: string;
  expiresAt: string;
  ownerAddress: string;
  agentId: string;
}

export interface SessionTokenPair {
  tokenType: "Bearer";
  accessToken: string;
  refreshToken: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  agentId: string;
  ownerAddress: string;
}

export interface IdentityState {
  agentId: string;
  ownerAddress: string;
  linkedPayerAddress?: string;
  payerLinked: boolean;
}

