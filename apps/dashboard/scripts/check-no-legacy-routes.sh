#!/usr/bin/env bash
set -euo pipefail

# Disallow direct usage of legacy compat endpoints outside the API compatibility layer/docs/tests.
# Canonical endpoints must be used by default.

if ! command -v rg >/dev/null 2>&1; then
  echo "rg is required"
  exit 1
fi

PATTERN='("|`)/(agents|events|orders|markets/quote|markets/execute|shopify/catalog/search)(["`?/]|$)'

MATCHES="$(rg -n -P "$PATTERN" apps/dashboard \
  -g '!apps/dashboard/lib/api/client.ts' \
  -g '!apps/dashboard/lib/api/client.integration.test.ts' \
  -g '!apps/dashboard/FRONTEND_CONTRACTS.md' \
  -g '!apps/dashboard/FRONTEND_PHASE_GATES.md' \
  -g '!apps/dashboard/scripts/check-no-legacy-routes.sh' \
  || true)"

if [[ -n "$MATCHES" ]]; then
  echo "Legacy compat endpoint usage detected outside approved files:"
  echo "$MATCHES"
  exit 1
fi

echo "No disallowed legacy compat endpoint usage found."
