# Troubleshooting: Auth / Session / x402

## 1) `INVALID_CHALLENGE` on `/api/auth/wallet/verify`

Cause:

- Challenge expired (`AUTH_CHALLENGE_TTL_MS`)
- Challenge already consumed (replay)
- Challenge ID is wrong

Checks:

1. Re-run `/api/auth/wallet/challenge` and sign fresh message.
2. Ensure the exact `message` from challenge is signed.
3. Verify system clock skew is not extreme.

## 2) `SIGNATURE_MISMATCH`

Cause:

- Signature was not created by `ownerAddress`
- Signed a different message

Checks:

1. Confirm local signer address equals `ownerAddress`.
2. Ensure no message mutation before signing.

## 3) `INVALID_REFRESH_TOKEN` on `/api/auth/session`

Cause:

- Refresh token expired
- Refresh token already used (rotation replay)
- Wrong token type was supplied

Checks:

1. Use latest persisted `refreshToken` from `~/.synoptic/session.json`.
2. Confirm only one process is refreshing at a time.
3. Re-run `synoptic-agent setup` if tokens are stale.

## 4) `OWNER_MISMATCH`

Cause:

- Session owner does not match agent owner identity

Checks:

1. Confirm `GET /api/auth/session` owner matches intended wallet.
2. Re-auth with correct wallet and relink identity.

## 5) `PAYER_NOT_LINKED` or `PAYER_MISMATCH`

Cause:

- Paid route received `x-payment` but no linked payer
- `authorization.from` in x-payment differs from linked payer

Checks:

1. Run `synoptic-agent setup` with MCP available.
2. Validate `GET /api/identity` returns linked payer.
3. Ensure MCP `approve_payment` uses the same payer account.

## 6) Replay rejection (`PAYMENT_VERIFY_FAILED` with replay reason)

Cause:

- Same x402 token reused after successful settle/verify.

Checks:

1. Never reuse `x-payment` token across requests.
2. Generate a fresh token per payment challenge.
3. Preserve and forward `x-payment-request-id` from the 402 challenge response.

## 7) Health shows facilitator down

Symptoms:

- `/health.payment.verifyReachable=down` or `settleReachable=down`

Checks:

1. Verify `KITE_PAYMENT_MODE=facilitator` and `KITE_FACILITATOR_URL`.
2. Curl `/v2/verify` and `/v2/settle` directly.
3. Inspect `payment.lastError` in `/health` for normalized reason text.
