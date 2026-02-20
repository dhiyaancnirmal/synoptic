#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if ! command -v rg >/dev/null 2>&1; then
  echo "ripgrep (rg) is required for legacy endpoint guard."
  exit 1
fi

# Route/UI files must not reference legacy compatibility endpoints directly.
# Compat-to-canonical translation is centralized in lib/api/client.ts.
# This guard scans dashboard lib code only (excluding the adapter, tests, and fixtures)
# to avoid false positives from browser route paths like "/agents".
if rg -n --no-heading \
  -g '!lib/api/client.ts' \
  -g '!lib/**/*.test.ts' \
  -g '!lib/**/*.integration.test.ts' \
  -g '!lib/api/__fixtures__/**' \
  -e '/agents' \
  -e '/events\\?' \
  -e '/orders/' \
  -e '/markets/quote' \
  -e '/markets/execute' \
  -e '/shopify/catalog/search' \
  "$ROOT_DIR/lib"; then
  echo
  echo "Legacy endpoint references detected outside lib/api/client.ts."
  echo "Use canonical /api/* routes or go through lib/api/client.ts adapters."
  exit 1
fi

echo "No direct legacy endpoint references found in dashboard route/component code."
