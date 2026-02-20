import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import net from "node:net";
import { after, before, test } from "node:test";

let backendProcess: ChildProcessWithoutNullStreams;
let baseUrl = "";
let agentId = "";
let apiClientModule: typeof import("./client.js");
let token = "";
let backendStdout = "";
let backendStderr = "";
let integrationReady = false;

async function getFreePort(): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("failed to allocate port"));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePort(port);
      });
    });
  });
}

async function waitForHealthy(url: string): Promise<void> {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (backendProcess.exitCode !== null) {
      break;
    }
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return;
    } catch {
      // ignore while booting
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }

  throw new Error(
    `backend did not become healthy at ${url}\nstdout:\n${backendStdout.slice(-1200)}\nstderr:\n${backendStderr.slice(-1200)}`
  );
}

before(async () => {
  try {
    const port = await getFreePort();
    baseUrl = `http://127.0.0.1:${port}`;

  backendProcess = spawn("pnpm", ["--filter", "@synoptic/agent-server", "exec", "tsx", "src/index.ts"], {
    cwd: resolve(process.cwd(), "..", ".."),
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: "pipe"
  });
  backendProcess.stdout.on("data", (chunk: Buffer) => {
    backendStdout += chunk.toString("utf-8");
  });
  backendProcess.stderr.on("data", (chunk: Buffer) => {
    backendStderr += chunk.toString("utf-8");
  });

    await waitForHealthy(baseUrl);

    const compatAgents = (await fetch(`${baseUrl}/agents`).then((response) => response.json())) as {
      agents?: Array<{ agentId?: string }>;
    };
    agentId = compatAgents.agents?.[0]?.agentId ?? "";
    assert.ok(agentId.length > 0, "bootstrap compat agent should exist");

    await fetch(`${baseUrl}/markets/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agentId,
        side: "BUY",
        size: "1",
        marketId: "ETH-USDC"
      })
    });

    process.env.NEXT_PUBLIC_AGENT_SERVER_URL = baseUrl;
    process.env.NEXT_PUBLIC_DASH_AGENT_ID = agentId;
    process.env.NEXT_PUBLIC_DASH_OWNER_ADDRESS = "0xabc";
    process.env.NEXT_PUBLIC_AUTH_MODE = "dev";
    process.env.NEXT_PUBLIC_ALLOW_COMPAT_MODE = "true";

    apiClientModule = (await import(`./client.js?integration=${Date.now()}`)) as typeof import("./client.js");
    token = await apiClientModule.ensureDashboardSessionToken();
    assert.ok(token.length > 0);
    integrationReady = true;
  } catch {
    integrationReady = false;
  }
});

after(async () => {
  delete process.env.NEXT_PUBLIC_AGENT_SERVER_URL;
  delete process.env.NEXT_PUBLIC_DASH_AGENT_ID;
  delete process.env.NEXT_PUBLIC_DASH_OWNER_ADDRESS;
  delete process.env.NEXT_PUBLIC_AUTH_MODE;
  delete process.env.NEXT_PUBLIC_ALLOW_COMPAT_MODE;

  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill("SIGTERM");
    await Promise.race([
      once(backendProcess, "exit"),
      new Promise((resolveDelay) => setTimeout(resolveDelay, 2000))
    ]);
  }
});

test("compat mode maps agents/activity/trades from live server", async () => {
  if (!integrationReady) return;
  const api = apiClientModule.createApiClient("compat");

  const agents = await api.listAgents(token);
  assert.ok(agents.length > 0);
  assert.equal(agents[0]?.id, agentId);

  const activity = await api.listActivity(token);
  assert.ok(activity.length > 0);
  assert.ok(activity.some((event) => event.eventType.length > 0));

  const trades = await api.listTrades(token);
  assert.ok(Array.isArray(trades));
});

test("canonical mode maps envelope-backed agents/trades/activity and handles payments list", async () => {
  if (!integrationReady) return;
  const api = apiClientModule.createApiClient("canonical");

  const agents = await api.listAgents(token);
  assert.ok(agents.length > 0);
  assert.equal(agents[0]?.name, "Bootstrap Agent");

  const trades = await api.listTrades(token);
  assert.ok(Array.isArray(trades));

  const activity = await api.listActivity(token);
  assert.ok(activity.length > 0);

  const payments = await api.listPayments(token);
  assert.ok(Array.isArray(payments));

  const unknownPayment = await api.getPayment("payment-does-not-exist", token);
  assert.equal(unknownPayment, null);
});
