# Uniswap Bounty: Build with Uniswap API

## Overview

Build an application or autonomous agent that integrates the Uniswap API to execute swaps or provide liquidity. Use the Uniswap Developer Platform to generate API keys and optionally build with the Uniswap AI Skill.

## Category

- Feature Usage

## Prize

- Total prize pool: `$5,000`
- Awards: `2`
- 1st place: `$3,000`
- 2nd place: `$2,000`
- If fewer than two projects qualify, prize distribution may change (`$1,000` to `$5,000` range)
- If no projects meet criteria, no award is required

## Requirements

- Functional on testnet or mainnet
- Must integrate Uniswap API

## Required Integration Shape

Implement Trading API as a server-side 3-step flow:

1. `POST /check_approval`
2. `POST /quote`
3. `POST /swap`

Required headers:

- `x-api-key`
- `x-universal-router-version: 2.0`
- `Content-Type: application/json`

Implementation note:

- Use a chain/network supported by the current Uniswap Trading API for the submitted swap path.

## Successful Project Signals

- Functional swap experience on testnet/mainnet
- Uses Uniswap infrastructure to sign transactions
- Trading agent that executes spot swaps via Uniswap API

## UI/UX Requirements

- Public interface that judges can access via URL
- Open-source codebase required
- Interface can be simple; intuitive UX earns extra points

## Judging Criteria

- Creative API integration
- Clear use case and measurable performance
- Functional and close to shipped MVP on testnet/mainnet

## Ecosystem Impact

Participation helps Uniswap improve:

- Uniswap API developer experience
- Developer Platform usability
- Builder enablement for API-powered products

## Resources

- Developer Platform (API keys): [https://developers.uniswap.org/dashboard](https://developers.uniswap.org/dashboard)
- Uniswap AI Skill: [https://github.com/Uniswap/uniswap-ai](https://github.com/Uniswap/uniswap-ai)
- API docs: [https://api-docs.uniswap.org/introduction](https://api-docs.uniswap.org/introduction)
- Feedback form: [https://share.hsforms.com/1DoHuIbyqQr65_aVuCVeybws8pgg](https://share.hsforms.com/1DoHuIbyqQr65_aVuCVeybws8pgg)

## Example Use Cases

- Automated DeFi workflows
- Yield optimization
- Portfolio management
- Trading strategies

## Recruitment

- N/A

## Synoptic Proof Checklist (P1)

Run command set (Node `22.22.0`):

```bash
nvm install 22.22.0
nvm use 22.22.0
corepack enable
pnpm install
bash scripts/p0-p1-evidence-harness.sh
```

Expected terminal outputs:

- `ok - Uniswap client uses required headers on check_approval, quote, and swap`
- `ok - Uniswap client validates tx data in /check_approval and /swap responses`

## Requirement -> Evidence Map

| Requirement                        | Evidence artifact                                                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Functional on testnet/mainnet path | Monad explorer swap tx screenshot/link from demo run                                                                                |
| Trading API integration            | `packages/agent-core/src/trading/uniswap-client.ts` shows `/check_approval`, `/quote`, `/swap` flow                                 |
| Required headers                   | Harness log `02-uniswap-acceptance-tests.log` plus test file assertions in `packages/agent-core/src/trading/uniswap-client.test.ts` |
| Public interface URL               | Dashboard URL in submission plus `/trading` screenshot                                                                              |
| Open-source codebase               | Public repository + linked integration files                                                                                        |

## Screenshot and Log Points

Capture all of:

- Dashboard `/trading` screenshot with `Trade Timeline`.
- Monad explorer screenshot for executed swap tx.
- `artifacts/evidence/p0-p1/<timestamp-utc>/02-uniswap-acceptance-tests.log`.
