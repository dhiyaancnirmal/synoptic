import assert from "node:assert/strict";
import { test } from "node:test";
import { executeStrategyOnce } from "./api.js";

test("CLI api exports strategy executor", () => {
  assert.equal(typeof executeStrategyOnce, "function");
});
