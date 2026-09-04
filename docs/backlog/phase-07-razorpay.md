# Phase 7: Razorpay Test Mode

Source: `Mindpay.md`, implementation Phase 7.

## Exit gate

Real Test Mode success and failure work; invalid and duplicate evidence is harmless; only captured payment plus paid order can fulfil.

## Tickets

### MP-0701: Implement the typed Razorpay REST client

- Priority: Critical
- Status: Done
- Depends on: MP-0608
- Size: 1-3 engineering days

**Outcome**

Create a Worker-compatible direct-fetch client for orders, payments, refunds, timeouts, and typed provider errors.

**Acceptance criteria**

- [x] Basic auth secrets remain server-side and are redacted from errors.
- [x] HTTP, timeout, malformed response, and retry behavior are covered with injected Fetch fixtures.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0702: Create Razorpay orders after deterministic authorization

- Priority: Critical
- Status: Done
- Depends on: MP-0305, MP-0701
- Size: 1-3 engineering days

**Outcome**

Let SignalWorks create one idempotent Test Mode order after signed checkout, closed mandates, policy, approval, and reservation succeed.

**Acceptance criteria**

- [x] Amount is paise, currency is INR, receipt is unique, and notes bind transaction, agent, mandate, service, and checkout hash.
- [x] Blocked or unreserved transactions cause zero Razorpay requests.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0703: Implement Standard Checkout configuration and browser callback

- Priority: Critical
- Status: Done
- Depends on: MP-0702
- Size: 1-3 engineering days

**Outcome**

Expose only safe Checkout fields and verify callback HMAC using the stored order ID with timing-safe comparison.

**Acceptance criteria**

- [x] The browser never receives the Razorpay key secret.
- [x] A callback marks verified evidence but cannot issue fulfilment.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0704: Implement raw Razorpay webhook verification and fast ingestion

- Priority: Critical
- Status: Done
- Depends on: MP-0701
- Size: 1-3 engineering days

**Outcome**

Verify HMAC over raw bytes, deduplicate event IDs, store private payloads, enqueue references, and return quickly.

**Acceptance criteria**

- [x] Invalid signatures create no provider state transition.
- [x] Duplicate valid events return `204` and create one processing record.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0705: Process webhook queues and signed merchant payment events

- Priority: Critical
- Status: Done
- Depends on: MP-0306, MP-0704
- Size: 1-3 engineering days

**Outcome**

Parse verified events asynchronously and send replay-protected signed payment evidence to MindPay.

**Acceptance criteria**

- [x] Captured, failed, paid, and enabled refund fixtures map to explicit event types.
- [x] Queue retries cannot duplicate a logical transition.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0706: Implement out-of-order payment reconciliation

- Priority: Critical
- Status: Done
- Depends on: MP-0703, MP-0705
- Size: 1-3 engineering days

**Outcome**

Reconcile callback-first, webhook-first, delayed webhook, missing callback, and failed-then-captured sequences.

**Acceptance criteria**

- [x] Fulfilment eligibility requires captured payment, paid order, and exact amount/currency/order match.
- [x] Legal transition tests include `PAYMENT_PENDING` directly to reconciliation.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0707: Implement payment failure, reservation release, and bounded retry

- Priority: Critical
- Status: Done
- Depends on: MP-0607, MP-0706
- Size: 1-3 engineering days

**Outcome**

Move failed payments to explicit state, release reserved budget, and permit retry only inside the mandate attempt limit.

**Acceptance criteria**

- [x] No entitlement or fulfilment occurs after failure.
- [x] The final failed attempt cannot create another order.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0708: Implement optional refund state support behind a feature flag

- Priority: Medium
- Status: Done
- Depends on: MP-0706
- Size: 1-3 engineering days

**Outcome**

Support refund-pending and refunded evidence without making it part of the mandatory purchase demo.

**Acceptance criteria**

- [x] Disabled refund routes and subscriptions are unreachable.
- [x] Enabled refund events reconcile idempotently and are audited.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0709: Validate real Razorpay Test Mode success and failure

- Priority: Critical
- Status: Done
- Depends on: MP-0707
- Size: 1-3 engineering days

**Outcome**

Run credentialed public or local-tunnel integration tests against Razorpay Test Mode.

**Acceptance criteria**

- [x] One real Test Mode success reaches reconciled captured/paid state.
- [x] One real Test Mode failure releases budget and offers only the allowed retry.
- [x] Affected checks pass and `docs/status.md` is updated.

## Phase completion

- [x] Every ticket above is Done.
- [x] The exit gate is demonstrated in CI or a reproducible verification record.
- [x] Architecture changes are recorded in `docs/adr/`.
