# Kite Bounty (Full Text)

## Bounty Prompt

Build an agent-native application on Kite AI using x402 payments and verifiable agent identity. Projects should demonstrate autonomous agents that can authenticate, pay, and transact across Web3 or Web2-style APIs with minimal human intervention.

Kite AI is the first purpose built AI payment chain designed for autonomous AI agents where software programs do not just think intelligently, but transact, coordinate, and operate economically at scale.

AI agents are rapidly evolving; they can reason, plan, negotiate, and act on our behalf, but the systems that move value, like cards, bank rails, or human-centric blockchain patterns, were not built for them. That is the core bottleneck in realizing the agentic economy.

Kite gives these agents their own economic rails with native support for pay-per-action micropayments, cryptographic identity, verifiable execution, and automated settlement, with near-instant finality and ultra-low cost.

## Bounty Category

- Feature Usage
- Launch MVP on Testnet or Mainnet
- Meaningful Open Source Contribution

## Prize Amount

- `$10,000`

## Number of Projects Awarded

- `5`

## Winner Breakdown

- 1st Place: `$5,000` (1 team)
- 2nd Place: `$3,000` (2 teams, `$1,500` each)
- 3rd Place: `$2,000` (2 teams, `$1,000` each)
- If fewer than three projects meet the bar, prizes may be adjusted.
- Minimum prize per project: `$1,000`.

## Requirements

Teams must build on one or more of the following topics:

- Build on Kite AI Testnet/mainnet
- Use x402-style payment flows (agent-to-API or agent-to-agent)
- Implement verifiable agent identity (wallet-based or credential-based)
- Demonstrate autonomous execution (no manual wallet clicking)
- Open-source core components (MIT / Apache license)

## What Does a Successful Project Look Like?

A successful project:

- Shows an AI agent authenticating itself
- Executes paid actions (API calls, services, transactions)
- Uses on-chain settlement or attestations
- Works end-to-end in a live demo in production (Vercel/AWS)

Bonus points for features such as:

- Multi-agent coordination
- Gasless or abstracted UX
- Security controls (rate limits, scopes, revocation)

## UI/UX Design Requirements

Sample implementation example:

- An AI agent that utilizes cloud compute, pays per request using x402, logs the transaction on Kite AI, and proves its identity to the service without exposing private keys, all autonomously.

Requirements:

- Functional UI required:
- Web app or
- CLI tool (Dockerized or standalone binary)

Demo must be:

- Publicly accessible URL or
- Reproducible via README instructions

Clear visualization of:

- Agent identity
- Payment flow
- On-chain confirmation

## How Are We Judging It?

Projects will be evaluated on:

- Agent Autonomy - minimal human involvement
- Correct x402 Usage - payments tied to actions
- Each paid API call must clearly map to an x402 payment in logs/UI
- Submissions must show how misuse or insufficient funds are handled (graceful failure, messaging)
- Security and Safety - key handling, scopes, limits
- Developer Experience - clarity, docs, usability
- Real-world Applicability - beyond local demos

## Impact on the Organization

Winning projects:

- Become reference implementations for Kite AI
- Share inputs/ideas for protocol design and SDK priorities
- May be featured in docs, talks, or partner demos
- Help validate Kite AI as agent-native payment infrastructure

## Resources

- Docs: [https://docs.gokite.ai/](https://docs.gokite.ai/)
- GitHub: [https://github.com/gokite-ai](https://github.com/gokite-ai)
- README: Kite AI Quickstart
- Kite AI Official Site: [https://gokite.ai/](https://gokite.ai/)
- Kite AI Docs (Developer + Chain Guides): [https://docs.gokite.ai/](https://docs.gokite.ai/)
- Kite Foundation Whitepaper: [https://kite.foundation/whitepaper](https://kite.foundation/whitepaper)

Guides:

- x402 Payments - In progress. Will be provided based on request.
- Agent Identity - In progress. Will be updated early next week.

Testnet setup:

- Network info: KiteAI Testnet RPC - [https://rpc-testnet.gokite.ai/](https://rpc-testnet.gokite.ai/) (Chain ID: `2368`)
- Faucet: [https://faucet.gokite.ai](https://faucet.gokite.ai)
- Explorer: [https://testnet.kitescan.ai](https://testnet.kitescan.ai)
- Explorer APIs: [https://kitescan.ai/api-docs](https://kitescan.ai/api-docs)
- Counter contract walkthrough: [https://docs.gokite.ai/kite-chain/3-developing/counter-smart-contract-hardhat](https://docs.gokite.ai/kite-chain/3-developing/counter-smart-contract-hardhat)
- AA SDK: [https://docs.gokite.ai/kite-chain/5-advanced/account-abstraction-sdk](https://docs.gokite.ai/kite-chain/5-advanced/account-abstraction-sdk)
- Multi-sig: [https://docs.gokite.ai/kite-chain/5-advanced/multisig-wallet](https://docs.gokite.ai/kite-chain/5-advanced/multisig-wallet)
- Stablecoin gasless transfer: [https://docs.gokite.ai/kite-chain/stablecoin-gasless-transfer](https://docs.gokite.ai/kite-chain/stablecoin-gasless-transfer)

Videos:

- Agent Payments Walkthrough

## Example Use Cases

- AI agents paying for APIs per request (x402)
- Autonomous DeFi agents executing paid strategies
- Web2 services monetized directly to AI agents
- Agent-to-agent marketplaces
- Secure enterprise agents with scoped permissions/guardrails

## Recruitment Opportunities

Kite listed active hiring for:

- Blockchain Infra Engineer (L1)
- Protocol Engineers (EVM / infra)
- AI Engineer

Top ETHDenver teams may be invited to:

- Join Kite Builders group / Tech Ambassador
- Collaborate on pilots
- Explore full-time roles post-hackathon
