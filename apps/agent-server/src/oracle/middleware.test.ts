import assert from "node:assert/strict";
import test from "node:test";
import { dayBucket } from "./middleware.js";

test("dayBucket uses UTC by default", () => {
  const timestamp = "2026-02-20T01:30:00.000Z";
  assert.equal(dayBucket(timestamp, "UTC"), "2026-02-20");
});

test("dayBucket respects configured timezone boundaries", () => {
  const timestamp = "2026-02-20T01:30:00.000Z";
  assert.equal(dayBucket(timestamp, "America/Los_Angeles"), "2026-02-19");
});

test("dayBucket falls back safely for invalid timezone", () => {
  const timestamp = "2026-02-20T01:30:00.000Z";
  assert.equal(dayBucket(timestamp, "Mars/Phobos"), "2026-02-20");
});
