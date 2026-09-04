# Phase 7 verification

- Date: 2026-09-04
- Deterministic result: Pass
- Real Razorpay Test Mode result: Pass

## Live Razorpay Test Mode evidence

The final evidence run used Razorpay Standard Checkout in a headed local browser with the
[official Test Mode cards](https://razorpay.com/docs/payments/payments/test-card-details/). The
account exposed Card, Netbanking, and Wallet methods but not UPI, so the published success card and
the published `card_declined` card were used. The browser held only the public `rzp_test_*` key;
credentials remained in the ignored SignalWorks `.dev.vars` file. No key secret, webhook secret,
card data, CVV, or full callback signature was retained in this record.

| Scenario | Provider order | Provider payment | Final provider state | Amount | Attempts | Provider timestamps (UTC) |
|---|---|---|---|---:|---:|---|
| Success | `order_TXvVIrl8FI4az1` | `pay_TXvsasJEUjKRl1` | `paid` / `captured`; callback signature valid | ₹299.00 | 1 | Order `2026-09-04T10:27:23Z`; payment `2026-09-04T10:49:27Z` |
| Failure | `order_TXvFObUOrM2Kyq` | `pay_TXvnMJbpdn6sbl` | `attempted` / `failed`; `payment_failed` | ₹449.00 | 1 | Order `2026-09-04T10:12:19Z`; payment `2026-09-04T10:44:29Z` |

MindPay's production `RazorpayClient` fetched and Zod-validated those exact objects. The production
reconciler returned `CAPTURED_PAID` with `fulfilment_eligible=true` for the success and `FAILED`
with reason `PAYMENT_FAILED` and `fulfilment_eligible=false` for the failure. The exact four
provider IDs were then substituted into the complete Gateway integration fixture for one evidence
run: the captured event committed spend once, the failed event released the active reservation,
one retry reserved budget and created a distinct second order, and the next retry returned
`PAYMENT_ATTEMPTS_EXHAUSTED`. The fixture source was restored immediately after the passing run.

Public provider-to-Worker webhook delivery remains a deployment concern tracked by MP-1203. Phase
7 verifies the same raw-body HMAC, private evidence, queue, deduplication, reconciliation, signed
merchant-event, and Gateway state path locally; the public endpoint is not claimed as deployed.

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

The real provider objects can be rechecked without printing credentials:

```bash
pnpm exec tsx scripts/verify-phase-07-live.ts \
  order_TXvVIrl8FI4az1 pay_TXvsasJEUjKRl1 \
  order_TXvFObUOrM2Kyq pay_TXvnMJbpdn6sbl
```

## Verified commands

| Command | Result | Proves |
|---|---|---|
| `pnpm exec tsx scripts/verify-phase-07-live.ts …` | Pass | Exact Test Mode objects validate and reconcile to `CAPTURED_PAID` and `FAILED` |
| `pnpm verify:phase-07` | Pass | Deterministic provider, signature, evidence, queue, state, budget, and retry boundaries |
| `pnpm check` | Pass | Formatting, lint, strict typecheck, and all tests across 18 workspaces |
| `pnpm build` | Pass | All 18 production Worker, package, and web builds |
| `git diff --check` | Pass | No malformed patch whitespace |

## Architecture record

ADR-0023 records merchant credential ownership, provider-call idempotency, callback non-authority,
raw webhook evidence, asynchronous reconciliation, signed merchant events, strict fulfilment
eligibility, and retry/refund boundaries.

## Result

MP-0701 through MP-0709 are implemented and reproducibly verified. Phase 7 is complete. Public
webhook delivery and deployment-domain alignment remain explicitly tracked in Phase 12.
