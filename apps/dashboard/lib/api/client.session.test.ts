import assert from "node:assert/strict";
import test from "node:test";

class MemorySessionStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.has(key) ? this.values.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function createToken(agentId: string): string {
  const payload = Buffer.from(JSON.stringify({ agentId }), "utf-8").toString("base64url");
  return `header.${payload}.signature`;
}

function setBrowserWindow(storage: MemorySessionStorage): void {
  (globalThis as { window?: unknown }).window = {
    sessionStorage: storage,
    atob: (value: string) => Buffer.from(value, "base64").toString("utf-8")
  };
}

test("request clears browser session token and throws on 401 in dev mode", async () => {
  const previousFetch = globalThis.fetch;
  const previousWindow = (globalThis as { window?: unknown }).window;
  const previousEnv = {
    NEXT_PUBLIC_AGENT_SERVER_URL: process.env.NEXT_PUBLIC_AGENT_SERVER_URL,
    NEXT_PUBLIC_DASH_AGENT_ID: process.env.NEXT_PUBLIC_DASH_AGENT_ID,
    NEXT_PUBLIC_DASH_OWNER_ADDRESS: process.env.NEXT_PUBLIC_DASH_OWNER_ADDRESS,
    NEXT_PUBLIC_AUTH_MODE: process.env.NEXT_PUBLIC_AUTH_MODE,
    NEXT_PUBLIC_API_MODE: process.env.NEXT_PUBLIC_API_MODE,
    NEXT_PUBLIC_ALLOW_COMPAT_MODE: process.env.NEXT_PUBLIC_ALLOW_COMPAT_MODE
  };

  const sessionStorage = new MemorySessionStorage();
  setBrowserWindow(sessionStorage);

  process.env.NEXT_PUBLIC_AGENT_SERVER_URL = "http://agent.example";
  process.env.NEXT_PUBLIC_DASH_AGENT_ID = "agent-1";
  process.env.NEXT_PUBLIC_DASH_OWNER_ADDRESS = "0xabc";
  process.env.NEXT_PUBLIC_AUTH_MODE = "dev";
  process.env.NEXT_PUBLIC_API_MODE = "canonical";
  process.env.NEXT_PUBLIC_ALLOW_COMPAT_MODE = "false";

  const firstToken = createToken("agent-1");
  let agentCalls = 0;

  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.endsWith("/api/agents")) {
      agentCalls += 1;
      const auth = new Headers(init?.headers).get("authorization");
      assert.equal(auth, `Bearer ${firstToken}`);
      return new Response(JSON.stringify({ code: "UNAUTHORIZED", message: "session expired" }), {
        status: 401,
        headers: { "content-type": "application/json" }
      });
    }

    return new Response("not-found", { status: 404 });
  }) as typeof fetch;

  try {
    const module = (await import(`./client.js?session-retry-${Date.now()}`)) as typeof import("./client.js");
    module.setSessionToken(firstToken);
    const client = module.createApiClient("canonical");
    await assert.rejects(
      async () => client.listAgents(),
      (error: unknown) =>
        error instanceof module.ApiClientError &&
        error.status === 401 &&
        error.message.length > 0
    );
    assert.equal(module.getSessionToken(), "");
    assert.equal(agentCalls, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = previousWindow;
    }
    process.env.NEXT_PUBLIC_AGENT_SERVER_URL = previousEnv.NEXT_PUBLIC_AGENT_SERVER_URL;
    process.env.NEXT_PUBLIC_DASH_AGENT_ID = previousEnv.NEXT_PUBLIC_DASH_AGENT_ID;
    process.env.NEXT_PUBLIC_DASH_OWNER_ADDRESS = previousEnv.NEXT_PUBLIC_DASH_OWNER_ADDRESS;
    process.env.NEXT_PUBLIC_AUTH_MODE = previousEnv.NEXT_PUBLIC_AUTH_MODE;
    process.env.NEXT_PUBLIC_API_MODE = previousEnv.NEXT_PUBLIC_API_MODE;
    process.env.NEXT_PUBLIC_ALLOW_COMPAT_MODE = previousEnv.NEXT_PUBLIC_ALLOW_COMPAT_MODE;
  }
});

test("request clears browser session token on 401 in passport mode", async () => {
  const previousFetch = globalThis.fetch;
  const previousWindow = (globalThis as { window?: unknown }).window;
  const previousEnv = {
    NEXT_PUBLIC_AGENT_SERVER_URL: process.env.NEXT_PUBLIC_AGENT_SERVER_URL,
    NEXT_PUBLIC_DASH_AGENT_ID: process.env.NEXT_PUBLIC_DASH_AGENT_ID,
    NEXT_PUBLIC_DASH_OWNER_ADDRESS: process.env.NEXT_PUBLIC_DASH_OWNER_ADDRESS,
    NEXT_PUBLIC_AUTH_MODE: process.env.NEXT_PUBLIC_AUTH_MODE,
    NEXT_PUBLIC_API_MODE: process.env.NEXT_PUBLIC_API_MODE,
    NEXT_PUBLIC_ALLOW_COMPAT_MODE: process.env.NEXT_PUBLIC_ALLOW_COMPAT_MODE
  };

  const sessionStorage = new MemorySessionStorage();
  setBrowserWindow(sessionStorage);

  process.env.NEXT_PUBLIC_AGENT_SERVER_URL = "http://agent.example";
  process.env.NEXT_PUBLIC_DASH_AGENT_ID = "agent-1";
  process.env.NEXT_PUBLIC_DASH_OWNER_ADDRESS = "0xabc";
  process.env.NEXT_PUBLIC_AUTH_MODE = "passport";
  process.env.NEXT_PUBLIC_API_MODE = "canonical";
  process.env.NEXT_PUBLIC_ALLOW_COMPAT_MODE = "false";

  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.endsWith("/api/agents")) {
      return new Response(JSON.stringify({ message: "expired" }), {
        status: 401,
        headers: { "content-type": "application/json" }
      });
    }
    return new Response("not-found", { status: 404 });
  }) as typeof fetch;

  try {
    const module = (await import(`./client.js?session-clear-${Date.now()}`)) as typeof import("./client.js");
    module.setSessionToken(createToken("agent-1"));
    const client = module.createApiClient("canonical");

    await assert.rejects(
      async () => client.listAgents(),
      (error: unknown) =>
        error instanceof module.ApiClientError &&
        error.status === 401 &&
        error.message.length > 0
    );
    assert.equal(module.getSessionToken(), "");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = previousWindow;
    }
    process.env.NEXT_PUBLIC_AGENT_SERVER_URL = previousEnv.NEXT_PUBLIC_AGENT_SERVER_URL;
    process.env.NEXT_PUBLIC_DASH_AGENT_ID = previousEnv.NEXT_PUBLIC_DASH_AGENT_ID;
    process.env.NEXT_PUBLIC_DASH_OWNER_ADDRESS = previousEnv.NEXT_PUBLIC_DASH_OWNER_ADDRESS;
    process.env.NEXT_PUBLIC_AUTH_MODE = previousEnv.NEXT_PUBLIC_AUTH_MODE;
    process.env.NEXT_PUBLIC_API_MODE = previousEnv.NEXT_PUBLIC_API_MODE;
    process.env.NEXT_PUBLIC_ALLOW_COMPAT_MODE = previousEnv.NEXT_PUBLIC_ALLOW_COMPAT_MODE;
  }
});
