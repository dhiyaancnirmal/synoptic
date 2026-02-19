#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL_FILE="$ROOT_DIR/SKILL.md"

if ! grep -q "KITE_bUSDT_BASE_SEPOLIA" "$SKILL_FILE"; then
  echo "SKILL.md missing required supported-market policy"
  exit 1
fi

if ! grep -q "Do not simulate fills" "$SKILL_FILE"; then
  echo "SKILL.md missing no-simulated-fill policy"
  exit 1
fi

if ! grep -q "paper-mode" "$SKILL_FILE"; then
  echo "SKILL.md missing explicit paper-mode scope for perps/prediction"
  exit 1
fi

echo "OpenClaw skill policy validation passed"
