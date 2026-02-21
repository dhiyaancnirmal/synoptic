---
name: opencode-agent-management
description: Orchestrate OpenCode agents from Codex using shell commands, including server lifecycle, role-based task runs, parallel dispatch, session tracking, and export workflows. Use when the user asks to run sub-agents via `opencode run`, manage `opencode serve`, inspect sessions/stats, or build auditable multi-agent execution loops.
---

# OpenCode Agent Management

Use this skill to delegate bounded tasks from Codex to OpenCode agents and keep runs auditable.

## Quick Start

1. Start/verify the OpenCode server:
   - `scripts/opencode_agent_manager.sh serve-start 4096`
   - `scripts/opencode_agent_manager.sh serve-status 4096`
2. Run a task with an explicit agent and title:
   - `scripts/opencode_agent_manager.sh run "Write unit tests for utils.ts" --agent tester --model openai/gpt-4.1 --title "Utils tests"`
3. Track and export:
   - `scripts/opencode_agent_manager.sh session-list --format json`
   - `scripts/opencode_agent_manager.sh stats --days 7 --models`
   - `scripts/opencode_agent_manager.sh export <session-id> artifacts/opencode/<session-id>.json`

## Workflow

1. Break work into independent subtasks.
2. Assign each subtask to one role (`reviewer`, `tester`, `builder`, or project-specific roles).
3. Pass a precise task prompt and always set `--title`.
4. Prefer JSON output (`--format json`) for parseable logs.
5. Run tasks in parallel only when subtasks are independent.
6. Consolidate results in Codex and identify follow-up actions.

## Role Selection

- `reviewer`: security, correctness, differential review.
- `tester`: tests, repro, validation.
- `builder`: implementation and focused refactors.
- Add custom roles in `~/.config/opencode/agents/*.md` as needed.

## Guardrails

- Keep prompts scoped; avoid broad "fix everything" asks.
- Use read-only/review roles before write-heavy roles on risky tasks.
- Store exports for auditability on important runs.
- If `serve-status` fails, restart server before task dispatch.
- Use `run-attached` only when attach mode is known to work in the local OpenCode version.

## Parallel Pattern

Use this only for independent tasks:

```bash
scripts/opencode_agent_manager.sh run "Task A" --agent reviewer --title "A" > /tmp/a.json &
scripts/opencode_agent_manager.sh run "Task B" --agent tester --title "B" > /tmp/b.json &
wait
```

## Resources

- `scripts/opencode_agent_manager.sh`: lifecycle/run/tracking wrapper.
- `references/command-playbook.md`: command patterns and examples.
