import { SessionAuth } from "../auth/session.js";
import { loadEnv } from "../env.js";

const DEFAULT_TEST_AGENT_ID = "agent-test";
const DEFAULT_TEST_OWNER_ADDRESS = "0x0000000000000000000000000000000000000001";

export function createTestAuthToken(input: {
  agentId?: string;
  ownerAddress?: string;
  ttlSeconds?: number;
} = {}): string {
  const env = loadEnv();
  const sessionAuth = new SessionAuth(env.authTokenSecret);
  return sessionAuth.signSession({
    agentId: input.agentId ?? DEFAULT_TEST_AGENT_ID,
    ownerAddress: input.ownerAddress ?? DEFAULT_TEST_OWNER_ADDRESS,
    ttlSeconds: input.ttlSeconds ?? 60 * 60
  });
}

export function createTestAuthHeaders(token = createTestAuthToken()): Record<string, string> {
  return {
    authorization: `Bearer ${token}`
  };
}
