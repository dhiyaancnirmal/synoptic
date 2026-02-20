# Kite AI Bounty: Agent-Native App with x402 + Verifiable Identity

## Overview
Build an agent-native application on Kite AI using x402 payments and verifiable agent identity. The project should demonstrate autonomous agents that can authenticate, pay, and transact across Web3 or Web2-style APIs with minimal human intervention.

Kite AI is a purpose-built AI payment chain for autonomous agents with native support for:
- Pay-per-action micropayments
- Cryptographic identity
- Verifiable execution
- Automated settlement
- Near-instant finality and low transaction cost

## Category
- Feature Usage
- Launch MVP on Testnet or Mainnet
- Meaningful Open Source Contribution

## Prize
- Total prize pool: `$10,000`
- Number of awarded projects: `5`
- 1st place: `$5,000` (1 team)
- 2nd place: `$3,000` total (2 teams, `$1,500` each)
- 3rd place: `$2,000` total (2 teams, `$1,000` each)
- If fewer than three projects meet the bar, prizes may be adjusted
- Minimum prize per project: `$1,000`

## Requirements
Projects must build on one or more of:
- Kite AI testnet/mainnet
- x402-style payment flows (agent-to-API or agent-to-agent)
- Verifiable agent identity (wallet-based or credential-based)
- Autonomous execution (no manual wallet clicking)
- Open-source core components (MIT/Apache)

## Successful Project Signals
A strong submission:
- Shows an AI agent authenticating itself
- Executes paid actions (API calls, services, transactions)
- Uses on-chain settlement or attestations
- Works end-to-end in a live production demo (Vercel/AWS)

Bonus features:
- Multi-agent coordination
- Gasless or abstracted UX
- Security controls (rate limits, scopes, revocation)

## UI/UX Requirements
A functional interface is required:
- Web app, or
- CLI tool (Dockerized or standalone binary)

Demo must be either:
- Publicly accessible URL, or
- Reproducible from README instructions

Must clearly visualize:
- Agent identity
- Payment flow
- On-chain confirmation

Sample implementation style:
- Agent uses cloud compute
- Pays per request with x402
- Logs transaction on Kite AI
- Proves identity without exposing private keys
- Runs autonomously

## Judging Criteria
- Agent autonomy with minimal human intervention
- Correct x402 usage with payments tied to each action
- Handling of misuse/insufficient funds with graceful failure messaging
- Security and safety (key handling, scopes, limits)
- Developer experience (clarity, docs, usability)
- Real-world applicability beyond local-only demos

## Ecosystem Impact
Winning projects may:
- Become Kite AI reference implementations
- Influence protocol and SDK priorities
- Be featured in docs, talks, or partner demos
- Help validate Kite AI agent-native payment infrastructure

## Resources
- Docs: [https://docs.gokite.ai/](https://docs.gokite.ai/)
- GitHub: [https://github.com/gokite-ai](https://github.com/gokite-ai)
- Official site: [https://gokite.ai/](https://gokite.ai/)
- Whitepaper: [https://kite.foundation/whitepaper](https://kite.foundation/whitepaper)
- Testnet RPC: [https://rpc-testnet.gokite.ai/](https://rpc-testnet.gokite.ai/) (Chain ID `2368`)
- Faucet: [https://faucet.gokite.ai](https://faucet.gokite.ai)
- Explorer: [https://testnet.kitescan.ai](https://testnet.kitescan.ai)
- Explorer API docs: [https://kitescan.ai/api-docs](https://kitescan.ai/api-docs)
- Counter contract walkthrough: [https://docs.gokite.ai/kite-chain/3-developing/counter-smart-contract-hardhat](https://docs.gokite.ai/kite-chain/3-developing/counter-smart-contract-hardhat)
- AA SDK: [https://docs.gokite.ai/kite-chain/5-advanced/account-abstraction-sdk](https://docs.gokite.ai/kite-chain/5-advanced/account-abstraction-sdk)
- Multi-sig: [https://docs.gokite.ai/kite-chain/5-advanced/multisig-wallet](https://docs.gokite.ai/kite-chain/5-advanced/multisig-wallet)
- Stablecoin gasless transfer: [https://docs.gokite.ai/kite-chain/stablecoin-gasless-transfer](https://docs.gokite.ai/kite-chain/stablecoin-gasless-transfer)

Note:
- `x402 Payments` and `Agent Identity` guides were listed as in progress in the source bounty details.

## Example Use Cases
- Agents paying APIs per request with x402
- Autonomous DeFi agents executing paid strategies
- Web2 services monetized directly to AI agents
- Agent-to-agent marketplaces
- Enterprise agents with scoped permissions and guardrails

## Recruitment
Kite AI listed active hiring tracks:
- Blockchain Infra Engineer (L1)
- Protocol Engineers (EVM/infra)
- AI Engineer

Top teams may be invited to:
- Kite Builders / Tech Ambassador programs
- Pilot collaborations
- Full-time role conversations post-hackathon

## Synoptic Proof Checklist (P0)

Run command set (Node `22.21.1`):

```bash
nvm install 22.21.1
nvm use 22.21.1
corepack enable
pnpm install
bash scripts/p0-p1-evidence-harness.sh
```

Expected terminal outputs:
- `backend guardrails: pass`
- `ok - oracle route enforces challenge, settles deterministic payment, and persists payment lifecycle`
- `ok - trade routes support list/get`
- `No direct legacy endpoint references found in dashboard route/component code.`

## Requirement -> Evidence Map

| Requirement | Evidence artifact |
|-------------|-------------------|
| Build on Kite testnet | Kite explorer tx screenshot/link in demo pack |
| x402 payment flow | Harness log `03-kite-oracle-trade-acceptance-tests.log` with 402 and settle lifecycle |
| Verifiable agent identity | `/agents` dashboard screenshot showing agent identity |
| Autonomous execution | `/activity` dashboard screenshot + trigger log showing automatic transitions |
| On-chain settlement proof | Kite explorer link/screenshot for payment settlement tx |
| On-chain attestation proof | Kite explorer link/screenshot for ServiceRegistry attestation tx |
| Open-source + reproducible demo | README command path + harness bundle under `artifacts/evidence/p0-p1/<timestamp-utc>/` |

## Screenshot and Log Points

Capture all of:
- Dashboard `/agents` page showing agent identity.
- Dashboard `/payments` page showing `Oracle Challenge / Retry`.
- Dashboard `/activity` page showing payment lifecycle events.
- Kite explorer settlement transaction page.
- Kite explorer attestation transaction page.
- Harness summary file: `artifacts/evidence/p0-p1/<timestamp-utc>/SUMMARY.txt`.
