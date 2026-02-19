# Agent Runtime Workstream (Mandatory: OpenClaw + MCP + CLI)

## Runtime Requirement
Synoptic requires all three runtime surfaces:
- OpenClaw
- MCP
- CLI

## Responsibilities

### OpenClaw
- Provide workspace skill instructions and execution guardrails.
- Support autonomous scheduled actions and explicit user-invoked actions.

### MCP Server
- Expose Synoptic capabilities as tool calls.
- Provide schema-stable tool interfaces consumed by OpenClaw and other clients.

### CLI
- Operator commands: setup, status, monitor
- Agent commands: run once, scheduled run, stop, inspect
- Headless execution path equal to OpenClaw path

## Integration Surface Distinctions
- Gateway node: WebSocket protocol-level capability host ([OpenClaw Gateway Protocol](https://docs.openclaw.ai/gateway/protocol))
- Workspace skill: lightweight prompt/tool extension in workspace skill model ([OpenClaw tools/skills docs](https://docs.openclaw.ai/tools/skills))
- External MCP server: standalone tool provider reachable through MCP bridge model ([OpenClaw VISION](https://github.com/openclaw/openclaw/blob/main/VISION.md))

## Notes on MCP in OpenClaw
OpenClaw core currently frames MCP support via `mcporter` bridge model rather than native core runtime ownership ([OpenClaw VISION](https://github.com/openclaw/openclaw/blob/main/VISION.md), [AGENTS default reference](https://github.com/openclaw/openclaw/blob/main/docs/reference/AGENTS.default.md)).
