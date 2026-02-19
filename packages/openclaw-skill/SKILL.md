---
name: synoptic-kite
description: Synoptic OpenClaw skill scaffold for identity, market, payment, and autonomy tools.
when:
  - user asks to monitor or execute Synoptic autonomous operations
metadata:
  openclaw:
    requires:
      env:
        - SYNOPTIC_API_URL
        - SYNOPTIC_AGENT_KEY
      binaries:
        - npx
---

# Synoptic Skill (Scaffold)

Use the Synoptic MCP tools for agent operations. Follow frozen v1 interfaces and do not infer undocumented payload shapes.

## Tool policy
- Verify identity status before trade execution.
- Respect risk and autonomy state commands.
- Return explicit errors when dependencies are unavailable.
