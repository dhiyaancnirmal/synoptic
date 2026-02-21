# OpenCode Command Playbook

## Launch and lifecycle

- Start server: `scripts/opencode_agent_manager.sh serve-start 4096`
- Check server: `scripts/opencode_agent_manager.sh serve-status 4096`
- Stop server: `scripts/opencode_agent_manager.sh serve-stop 4096`

## Run role-based tasks

- Standard run (recommended on this setup):
  `scripts/opencode_agent_manager.sh run "Write tests for utils.ts" --agent tester --model openai/gpt-4.1 --title "Utils tests"`
- Attached run (use when your OpenCode server context supports attach):
  `scripts/opencode_agent_manager.sh run-attached "Review payments route for regressions" --agent reviewer --title "Payments review"`

## Tracking and exports

- Sessions: `scripts/opencode_agent_manager.sh session-list --format json`
- Stats: `scripts/opencode_agent_manager.sh stats --days 7 --models`
- Export: `scripts/opencode_agent_manager.sh export <session-id> artifacts/opencode/<session-id>.json`

## Parallel usage pattern from Codex shell

```bash
scripts/opencode_agent_manager.sh run "Task A" --agent reviewer --title "A" > /tmp/a.json &
scripts/opencode_agent_manager.sh run "Task B" --agent tester --title "B" > /tmp/b.json &
wait
```

Use separate output files per task so results remain auditable.
