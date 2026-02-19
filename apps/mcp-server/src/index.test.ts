import assert from "node:assert/strict";
import { test } from "node:test";
import { createMcpServer, TOOL_DEFINITIONS } from "./index.js";

test("MCP tool registration includes expected tool set", () => {
  const names = TOOL_DEFINITIONS.map((tool) => tool.name).sort();
  assert.deepEqual(names, [
    "synoptic.autonomy.start",
    "synoptic.autonomy.stop",
    "synoptic.identity.status",
    "synoptic.market.list",
    "synoptic.order.status",
    "synoptic.trade.execute",
    "synoptic.trade.quote"
  ]);
});

test("MCP server initializes with tool capabilities", () => {
  const server = createMcpServer();
  assert.ok(server);
});
