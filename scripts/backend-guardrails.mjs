#!/usr/bin/env node

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();

const RUNTIME_SCAN_DIRS = [
  "apps/agent-server/src",
  "packages/agent-core/src",
  "packages/db/src"
];

const TODO_PATTERNS = [/\bTODO\b/i, /\bFIXME\b/i, /\bstub\b/i, /not implemented/i];

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      out.push(...listFiles(fullPath));
      continue;
    }
    out.push(fullPath);
  }
  return out;
}

function getTsRuntimeFiles() {
  const files = [];
  for (const dir of RUNTIME_SCAN_DIRS) {
    const fullDir = join(root, dir);
    if (!existsSync(fullDir)) {
      continue;
    }
    for (const file of listFiles(fullDir)) {
      if (!file.endsWith(".ts")) continue;
      if (file.endsWith(".test.ts")) continue;
      if (file.endsWith(".d.ts")) continue;
      files.push(file);
    }
  }
  return files;
}

function checkNoTodoStubs(files) {
  const violations = [];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const lines = content.split("\n");
    lines.forEach((line, idx) => {
      if (TODO_PATTERNS.some((pattern) => pattern.test(line))) {
        violations.push(`${relative(root, file)}:${idx + 1}`);
      }
    });
  }
  return violations;
}

function checkRouteIntegrationTests() {
  const routeDir = join(root, "apps/agent-server/src/routes");
  if (!existsSync(routeDir)) {
    return ["apps/agent-server/src/routes directory is missing"];
  }

  const routeFiles = readdirSync(routeDir).filter((file) => file.endsWith(".ts"));
  const missing = [];
  for (const routeFile of routeFiles) {
    const base = routeFile.replace(/\.ts$/, "");
    const expected = join(root, "apps/agent-server/src/integration", `${base}.integration.test.ts`);
    if (!existsSync(expected)) {
      missing.push(`missing integration test for route ${routeFile}: apps/agent-server/src/integration/${base}.integration.test.ts`);
    }
  }

  const oracleTest = join(root, "apps/agent-server/src/integration/oracle.integration.test.ts");
  if (!existsSync(oracleTest)) {
    missing.push("missing integration test for oracle route: apps/agent-server/src/integration/oracle.integration.test.ts");
  }

  const serverTest = join(root, "apps/agent-server/src/integration/server.integration.test.ts");
  if (!existsSync(serverTest)) {
    missing.push("missing integration test for app-level public handlers: apps/agent-server/src/integration/server.integration.test.ts");
  }

  return missing;
}

function checkAdapterContractTests() {
  const adapterDir = join(root, "packages/agent-core/src/adapters");
  if (!existsSync(adapterDir)) {
    return ["packages/agent-core/src/adapters directory is missing"];
  }

  const adapterFiles = readdirSync(adapterDir)
    .filter((file) => file.endsWith(".ts"))
    .filter((file) => !file.endsWith(".contract.test.ts"));

  const missing = [];
  for (const adapterFile of adapterFiles) {
    const expected = adapterFile.replace(/\.ts$/, ".contract.test.ts");
    const expectedPath = join(adapterDir, expected);
    if (!existsSync(expectedPath)) {
      missing.push(`missing contract test for adapter interface ${adapterFile}: packages/agent-core/src/adapters/${expected}`);
    }
  }
  return missing;
}

const todoViolations = checkNoTodoStubs(getTsRuntimeFiles());
const routeCoverageViolations = checkRouteIntegrationTests();
const adapterCoverageViolations = checkAdapterContractTests();

if (
  todoViolations.length === 0 &&
  routeCoverageViolations.length === 0 &&
  adapterCoverageViolations.length === 0
) {
  console.log("backend guardrails: pass");
  process.exit(0);
}

console.error("backend guardrails: failed");
if (todoViolations.length > 0) {
  console.error("\nNo TODO stubs rule violations:");
  for (const violation of todoViolations) {
    console.error(`- ${violation}`);
  }
}
if (routeCoverageViolations.length > 0) {
  console.error("\nPublic handler integration test rule violations:");
  for (const violation of routeCoverageViolations) {
    console.error(`- ${violation}`);
  }
}
if (adapterCoverageViolations.length > 0) {
  console.error("\nAdapter contract test rule violations:");
  for (const violation of adapterCoverageViolations) {
    console.error(`- ${violation}`);
  }
}
process.exit(1);
