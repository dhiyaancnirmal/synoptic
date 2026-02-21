#!/usr/bin/env bash
set -euo pipefail

CODEX_HOME_DIR="${CODEX_HOME:-$HOME/.codex}"
OPENCODE_HOME="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"

mkdir -p "$CODEX_HOME_DIR/agents" "$OPENCODE_HOME/agents"

cat > "$CODEX_HOME_DIR/agents/reviewer.toml" <<'CFG'
model = "o3"
model_reasoning_effort = "high"
sandbox_mode = "read-only"
developer_instructions = "Review for correctness, security, and regression risk. Prioritize concrete findings with file references."
CFG

cat > "$CODEX_HOME_DIR/agents/explorer.toml" <<'CFG'
model = "gpt-5-codex"
model_reasoning_effort = "minimal"
sandbox_mode = "read-only"
developer_instructions = "Explore code quickly, summarize architecture, and identify exact files for follow-up work."
CFG

cat > "$CODEX_HOME_DIR/agents/tester.toml" <<'CFG'
model = "gpt-5-codex"
model_reasoning_effort = "medium"
sandbox_mode = "workspace-write"
developer_instructions = "Add or fix tests, run targeted test commands, and report failing/passing results concisely."
CFG

cat > "$CODEX_HOME_DIR/agents/builder.toml" <<'CFG'
model = "gpt-5-codex"
model_reasoning_effort = "medium"
sandbox_mode = "workspace-write"
developer_instructions = "Implement focused code changes with minimal diffs, then run relevant validation commands."
CFG

if [[ -f "$CODEX_HOME_DIR/config.toml" ]] && ! rg -q 'BEGIN synoptic-multi-agent' "$CODEX_HOME_DIR/config.toml"; then
  cp "$CODEX_HOME_DIR/config.toml" "$CODEX_HOME_DIR/config.toml.bak-$(date +%Y%m%d-%H%M%S)"
fi

if [[ ! -f "$CODEX_HOME_DIR/config.toml" ]]; then
  touch "$CODEX_HOME_DIR/config.toml"
fi

if ! rg -q 'BEGIN synoptic-multi-agent' "$CODEX_HOME_DIR/config.toml"; then
  cat >> "$CODEX_HOME_DIR/config.toml" <<CFG

# BEGIN synoptic-multi-agent
[features]
multi_agent = true

[agents.max_threads]
default = 4

[agents.reviewer]
description = "Find security and correctness issues."
config_file = "${CODEX_HOME_DIR}/agents/reviewer.toml"

[agents.explorer]
description = "Fast read-only codebase exploration."
config_file = "${CODEX_HOME_DIR}/agents/explorer.toml"

[agents.tester]
description = "Write and run focused tests."
config_file = "${CODEX_HOME_DIR}/agents/tester.toml"

[agents.builder]
description = "Implement scoped code changes with verification."
config_file = "${CODEX_HOME_DIR}/agents/builder.toml"
# END synoptic-multi-agent
CFG
fi

cat > "$OPENCODE_HOME/agents/reviewer.md" <<'CFG'
---
version: 0.1.0
requires: ">=0.1.0"
updated: 2026-02-20
---

# Reviewer Agent

Audit code for correctness, security, and behavior regressions.
CFG

cat > "$OPENCODE_HOME/agents/tester.md" <<'CFG'
---
version: 0.1.0
requires: ">=0.1.0"
updated: 2026-02-20
---

# Tester Agent

Design and execute tests for changed behavior.
CFG

cat > "$OPENCODE_HOME/agents/builder.md" <<'CFG'
---
version: 0.1.0
requires: ">=0.1.0"
updated: 2026-02-20
---

# Builder Agent

Implement scoped engineering tasks safely and verify results.
CFG

echo "Codex/OpenCode multi-agent setup completed."
