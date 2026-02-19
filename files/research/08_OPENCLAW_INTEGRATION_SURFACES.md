# OpenClaw Integration Surfaces

## Summary
OpenClaw capability extension can be achieved via:
1. Gateway node (protocol-level WebSocket integration)
2. Workspace skill (`SKILL.md` style prompt/tool extension)
3. External MCP server (tool provider bridge)

Core protocol framing references are in [OpenClaw gateway protocol docs](https://docs.openclaw.ai/gateway/protocol).

## Officially Verified References
- Gateway protocol framing (`req`/`res`/`event`) and node role/caps/commands/permissions: [docs.openclaw.ai/gateway/protocol](https://docs.openclaw.ai/gateway/protocol)
- Skills docs and workspace behavior: [docs.openclaw.ai/tools/skills](https://docs.openclaw.ai/tools/skills)
- OpenClaw MCP bridge stance via `mcporter`: [OpenClaw VISION](https://github.com/openclaw/openclaw/blob/main/VISION.md)
- OpenClaw docs MCP package listing: [npm openclaw-docs-mcp](https://www.npmjs.com/package/openclaw-docs-mcp)

## Community References (Use as Secondary)
- OpenClaw architecture/usage blog posts and integrations
- MCP bridge examples and tutorials outside official docs

These are useful for patterns but should not override official protocol/docs behavior.

## Usage Guidance
- Use Gateway node when you need deep system/hardware invocation.
- Use workspace skill for lightweight prompt/tool behavior.
- Use external MCP server for standalone tool APIs and workflow engines.
