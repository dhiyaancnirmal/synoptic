# Contributing

## Parallel Workstreams
- Frontend, backend, and runtime tracks can proceed in parallel.
- Shared interfaces are owned centrally and consumed by all tracks.
- Do not bypass `@synoptic/types` with ad-hoc payload shapes.

## Interface Freeze Policy
Canonical contract source: `files/architecture/04_INTERFACE_CONTRACTS.md`.

Breaking schema changes require:
1. Semver bump
2. Changelog entry
3. Downstream migration note

## Development Workflow
1. Install dependencies: `pnpm install`
2. Validate: `pnpm lint && pnpm typecheck && pnpm test`
3. Build: `pnpm build`

## Quality Gates
- TypeScript strict mode stays enabled.
- Lint must pass before merge.
- Scaffolds should include minimal smoke tests.
