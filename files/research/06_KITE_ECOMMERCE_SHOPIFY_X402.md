# Kite Ecommerce Research: Shopify + x402

## Mental Model: Where Kite Fits
Kite is positioned as an EVM-compatible, agent-centric payment chain with delegated controls (user -> agent -> session), enabling bounded autonomous spending. Sources: [Kite docs](https://docs.gokite.ai), [Kite whitepaper](https://kite.foundation/whitepaper), [Binance Academy summary](https://www.binance.com/en/academy/articles/what-is-kite-kite).

## Shopify MCP + REST/UCP Path
- Shopify MCP can provide product/catalog/cart interaction surfaces for agents.
- Shopify checkout/payment integration can be bridged through backend glue that confirms Kite settlement before final checkout confirmation.
- Practical architecture: agent uses MCP for commerce actions; backend handles payment intent to Kite settlement callback.

Sources:
- [Shopify storefront MCP docs](https://shopify.dev/docs/apps/build/storefront-mcp)
- [Shopify AI commerce announcement](https://www.shopify.com/news/ai-commerce-at-scale)
- [Ecosystem write-up](https://www.francescatabor.com/articles/2025/8/14/shopify-and-the-model-context-protocol-mcp-in-e-commerce)

## x402-Style Payments on Kite
Standard x402 pattern:
1. Server returns `HTTP 402 Payment Required` with payment requirements.
2. Client submits signed payment payload in `X-PAYMENT`.
3. Service verifies and settles via facilitator.

To adapt to Kite:
- Define Kite-compatible token + payload semantics.
- Implement facilitator that verifies signed payload and settles on Kite.
- Maintain policy enforcement via user/agent/session limits.

Sources:
- [x402 reference](https://www.x402.org)
- [QuickNode x402 explainer](https://blog.quicknode.com/x402-protocol-explained-inside-the-https-native-payment-layer/)
- [Solana x402 tutorial (flow reference)](https://solana.com/developers/guides/getstarted/intro-to-x402)
- [Browserbase x402 intro](https://docs.browserbase.com/integrations/x402/introduction)

## Other Ecommerce Patterns
- Plain REST + OAuth/API-key commerce integrations.
- Chain-specific payment variants for paid APIs.
- Account abstraction/smart-wallet delegated spending patterns.

Sources:
- [Arcade enterprise MCP guide](https://www.arcade.dev/blog/enterprise-mcp-guide-for-retail-ecommerce)
- [Backpack x402 explainer](https://learn.backpack.exchange/articles/what-is-x402)

## Porting Recipe to Kite
1. Extract primitives from existing implementation (not vendor-specific code).
2. Design Kite-native contracts for settlement + policy enforcement.
3. Build off-chain facilitator/bridge layers.
4. Wire AI agent to MCP commerce tools + signed Kite payment flow.

Sources: [Kite docs](https://docs.gokite.ai), [Kite whitepaper](https://kite.foundation/whitepaper), [x402 spec](https://www.x402.org).

## Official vs Ecosystem Source Tags
- Official: `docs.gokite.ai`, `kite.foundation`, `shopify.dev`, `shopify.com`, `x402.org`
- Ecosystem: QuickNode, Solana guide, Browserbase docs, Backpack, Arcade, independent blog analyses
- Community: individual posts not owned by protocol/vendor organizations
