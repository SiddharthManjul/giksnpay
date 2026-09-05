# Phase 8 verification: entitlements and MCP fulfilment

Date: 2026-09-04

## Exit gate

A captured-and-paid transaction receives one short-lived, service-scoped entitlement. SignalWorks
can consume it once and only once. Unpaid, expired, replayed, wrong-binding, over-permissioned, and
schema-invalid paths do not produce a second service execution or a successful fulfilment.

## Evidence

| Boundary | Verified behavior |
|---|---|
| Contracts | Strict ES256 JWT claims, one exact scope, service-specific structured outputs, fulfilment status, and signed delivery receipts reject unknown or mismatched fields |
| Issuance | Only signed captured-and-paid reconciliation inserts an entitlement; failed payments insert none; canonical storage contains a SHA-256 token hash, not plaintext JWT material |
| Redemption | SignalWorks verifies JWKS signature, issuer, audience, agent/payment/service bindings, expiry, and local paid order before atomic consumption |
| Replay | Concurrent calls yield one completed execution and one `ENTITLEMENT_ALREADY_CONSUMED`; unique token, entitlement, and transaction constraints also reject sequential replay |
| Output | Invalid structured output receives one bounded retry, then records `FAILED` without a result or receipt |
| Receipt | Output is canonically hashed, the merchant receipt is ES256-signed, and MindPay verifies every binding before immutable storage and `FULFILLED` |
| SignalWorks MCP | Protocol discovery returns only `redeem_market_snapshot`, `redeem_competitor_dossier`, and `get_fulfilment_status`; Host validation rejects other authorities |
| MindPay MCP | Protocol discovery returns only the six approved non-payment tools; session/org auth, published agent bindings, commerce scope, D1 rate limits, and immutable invocation audits are enforced |

## Reproduction

```bash
pnpm verify:phase-08
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The focused verifier runs contract and JWT tests, reproducible D1 migration integrity, both actual
MCP protocol endpoints, concurrent merchant redemption, output-schema failure, the existing
Razorpay capture/failure flow, entitlement issuance, signed receipt verification, duplicate receipt
idempotency, and final result persistence.

Architecture decision: `docs/adr/0024-one-time-entitlement-and-remote-mcp-boundary.md`.
