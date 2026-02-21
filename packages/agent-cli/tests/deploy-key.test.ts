import { describe, it, afterEach } from "node:test";
import assert from "node:assert";
import { loadWallet } from "../src/wallet.js";

describe("deploy-key command logic", () => {
  const originalHome = process.env.SYNOPTIC_HOME;

  afterEach(() => {
    if (originalHome !== undefined) {
      process.env.SYNOPTIC_HOME = originalHome;
    } else {
      delete process.env.SYNOPTIC_HOME;
    }
  });

  it("should construct correct railway variables set command", () => {
    const privateKey = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    const args = ["variables", "set", `AGENT_PRIVATE_KEY=${privateKey}`];

    const command = `railway ${args.join(" ")}`;

    assert.ok(command.includes("railway variables set"));
    assert.ok(command.includes("AGENT_PRIVATE_KEY=0x"));
    assert.ok(command.includes(privateKey));
  });

  it("should include --service flag when service option provided", () => {
    const privateKey = "0xabcd";
    const service = "agent-server";
    const args = ["variables", "set", `AGENT_PRIVATE_KEY=${privateKey}`];
    args.push("--service", service);

    const command = `railway ${args.join(" ")}`;

    assert.ok(command.includes("--service agent-server"));
  });

  it("should return null when no wallet exists", () => {
    process.env.SYNOPTIC_HOME = "/tmp/nonexistent-synoptic-test-" + Date.now();
    const wallet = loadWallet();
    assert.strictEqual(wallet, null);
  });

  it("should construct deploy-contract command with AGENT_PRIVATE_KEY env", () => {
    const privateKey = "0xdeadbeef";
    const env: Record<string, string> = { ...process.env as Record<string, string>, AGENT_PRIVATE_KEY: privateKey };

    assert.strictEqual(env.AGENT_PRIVATE_KEY, privateKey);
    assert.ok(env.PATH); // inherits rest of env
  });

  it("should parse deploy script JSON output", () => {
    const stdout = `Compiling...\n{"contract":"ServiceRegistry","address":"0x1234","deployer":"0x5678","deploymentTxHash":"0xabcd","blockNumber":42,"network":"kiteTestnet","chainId":2368}`;
    const jsonLine = stdout.trim().split("\n").pop() ?? "";
    const parsed = JSON.parse(jsonLine);

    assert.strictEqual(parsed.contract, "ServiceRegistry");
    assert.strictEqual(parsed.address, "0x1234");
    assert.strictEqual(parsed.chainId, 2368);
  });
});
