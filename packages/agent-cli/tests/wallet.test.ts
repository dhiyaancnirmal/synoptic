import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { existsSync, rmSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { generateWallet, loadWallet, deleteWallet, getWalletPath } from "../src/wallet.js";

const TEST_DIR = join(tmpdir(), "synoptic-agent-test-" + Date.now());

describe("Wallet Module", () => {
  beforeEach(() => {
    process.env.SYNOPTIC_HOME = TEST_DIR;
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    delete process.env.SYNOPTIC_HOME;
  });

  it("should generate a new wallet with valid address", () => {
    const wallet = generateWallet();

    assert.ok(wallet.address.startsWith("0x"));
    assert.equal(wallet.address.length, 42);
    assert.ok(wallet.privateKey.startsWith("0x"));
    assert.equal(wallet.privateKey.length, 66);
    assert.ok(wallet.version === 1);
  });

  it("should store wallet with correct file permissions", () => {
    generateWallet();
    const walletPath = getWalletPath();

    assert.ok(existsSync(walletPath));

    const content = readFileSync(walletPath, "utf-8");
    const parsed = JSON.parse(content);

    assert.ok(parsed.address);
    assert.ok(parsed.privateKey);
  });

  it("should load existing wallet correctly", () => {
    const original = generateWallet();
    const loaded = loadWallet();

    assert.ok(loaded);
    assert.equal(loaded?.address, original.address);
    assert.equal(loaded?.privateKey, original.privateKey);
  });

  it("should return null if wallet file doesn't exist", () => {
    const loaded = loadWallet();
    assert.equal(loaded, null);
  });

  it("should throw if wallet already exists", () => {
    generateWallet();

    assert.throws(() => {
      generateWallet();
    }, /already exists/);
  });

  it("should delete wallet successfully", () => {
    generateWallet();
    const result = deleteWallet();

    assert.equal(result, true);
    assert.equal(existsSync(getWalletPath()), false);
  });

  it("should return false if deleting non-existent wallet", () => {
    const result = deleteWallet();
    assert.equal(result, false);
  });
});
