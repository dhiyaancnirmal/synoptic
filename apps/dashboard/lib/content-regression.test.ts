import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

test("dashboard copy uses Trading label and no legacy route label remnants", async () => {
  const sidebarPath = resolve(process.cwd(), "components/dashboard/RouteSidebarNav.tsx");
  const tradingPath = resolve(process.cwd(), "components/dashboard/routes/TradingRouteClient.tsx");

  const [sidebar, trading] = await Promise.all([
    readFile(sidebarPath, "utf8"),
    readFile(tradingPath, "utf8")
  ]);

  const removedLabel = "Spot" + " Trading";
  assert.equal(sidebar.includes(removedLabel), false);
  assert.equal(trading.includes(removedLabel), false);
  assert.ok(trading.includes("Swaps & Orders"));
  assert.ok(trading.includes("Liquidity Provision"));
});

test("trading and marketplace routes keep meaningful sections and empty-state fallbacks", async () => {
  const tradingPath = resolve(process.cwd(), "components/dashboard/routes/TradingRouteClient.tsx");
  const marketplacePath = resolve(process.cwd(), "components/dashboard/routes/MarketplaceRouteClient.tsx");
  const cockpitPath = resolve(process.cwd(), "components/dashboard/routes/CockpitRouteClient.tsx");

  const [trading, marketplace, cockpit] = await Promise.all([
    readFile(tradingPath, "utf8"),
    readFile(marketplacePath, "utf8"),
    readFile(cockpitPath, "utf8")
  ]);

  assert.ok(trading.includes("quote, execute, and monitor routing lifecycle"));
  assert.ok(trading.includes("Quote first before execute."));
  assert.ok(marketplace.includes("SKU Catalog"));
  assert.ok(marketplace.includes("Purchase Ledger"));
  assert.ok(cockpit.includes("Operator Action Queue"));
  assert.ok(cockpit.includes("No recent failures requiring action."));
});
