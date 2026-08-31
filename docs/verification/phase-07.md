# Phase 7 verification

- Date: 2026-08-31
- Deterministic result: Pass
- Real Razorpay Test Mode result: Pending credentials and public webhook/callback run

## Exit-gate evidence

| Scenario | Verified result |
|---|---|
| Authorized reserved order | Exactly one provider call; stable receipt and authority notes; public-only Checkout response |
| Blocked/unreserved order | Gateway rejects before the merchant provider dependency; zero provider calls |
| Invalid callback | No callback evidence and no payment transition |
| Valid callback | Immutable verified evidence; remains non-eligible in `PAYMENT_RECONCILING` |
| Invalid webhook | No R2 object, provider-event row, queue message, or payment transition |
| Duplicate valid webhook | `204`; one provider-event record and one logical transition |
| Paid before captured | First event remains reconciling; later captured event converges to eligible |
| Captured plus paid | Exact order/amount/currency match; reservation commits once; transaction reaches `PAYMENT_CAPTURED` |
| Payment failed | No fulfilment; attempt fails and active reservation releases |
| Retry | New active reservation and provider order for attempt two only |
| Final failed attempt | Further reservation/order creation rejected with `PAYMENT_ATTEMPTS_EXHAUSTED` |
| Refund/read-only adapter disabled | Routes return not found until their independent flags are enabled |

## Boundaries verified

- The Worker-compatible client uses Test Mode-only credentials, server-side Basic Auth, typed Zod
  responses, redacted errors, explicit timeouts, bounded GET retries, and no ambiguous POST retry.
- SignalWorks stores provider payment state in its independent D1. MindPay stores only signed
  merchant payment evidence and the fields required for its transaction and budget authority.
- Callback HMAC uses the stored order ID. Webhook HMAC uses the exact raw body and supports one
  previous secret during rotation.
- Raw webhook bodies are private R2 evidence. Queue messages contain only D1 references, and queue
  retries are guarded by provider event ID plus signed-event nonce uniqueness.
- Only `order=paid`, `payment=captured`, exact provider references, exact amount/currency, and an
  active reservation can set `fulfilment_eligible` and commit budget.
- Refund and read-only provider status paths are disabled independently by default.

## Reproducible suite

`pnpm verify:phase-07` runs six fail-fast layers: the Razorpay client/security unit suite, payment
contracts, environment flags, reproducible D1 migrations, SignalWorks D1/R2/queue integration, and
the authenticated Gateway reservation/payment/retry integration.

## Verified commands

| Command | Result | Proves |
|---|---|---|
| `pnpm verify:phase-07` | Pass | Deterministic provider, signature, evidence, queue, state, budget, and retry boundaries |
| `pnpm check` | Pass | Formatting, lint, strict typecheck, and all tests across 18 workspaces |
| `pnpm build` | Pass | All 18 production Worker, package, and web builds |
| `git diff --check` | Pass | No malformed patch whitespace |

## External Test Mode validation still required

The current environment has no `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, or
`RAZORPAY_WEBHOOK_SECRET`. MP-0709 therefore cannot be truthfully marked Done here. To close it:

1. configure the three secrets only in the SignalWorks Worker and configure a public/tunnel webhook
   to `/webhooks/razorpay`;
2. run one Standard Checkout payment with Razorpay's Test Mode success instrument and retain the
   provider order/payment/event IDs;
3. run one Test Mode failure, verify `PAYMENT_FAILED`, released budget, and one allowed retry; and
4. append the redacted IDs and timestamps to this record, then mark MP-0709 and Phase 7 Done.

## Architecture record

ADR-0023 records merchant credential ownership, provider-call idempotency, callback non-authority,
raw webhook evidence, asynchronous reconciliation, signed merchant events, strict fulfilment
eligibility, and retry/refund boundaries.

## Result

MP-0701 through MP-0708 are implemented and reproducibly verified. MP-0709 is blocked only on the
external Razorpay Test Mode credentialed run; no local implementation work remains for that ticket.
