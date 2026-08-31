# ADR-0023: Razorpay evidence and merchant payment boundary

- Status: Accepted
- Date: 2026-08-31
- Decision owners: MindPay engineering

## Context

Phase 7 introduces MindPay's first external payment side effect. Razorpay Test Mode credentials
belong to SignalWorks, while MindPay owns the user's mandates, policy decision, budget reservation,
transaction state, and entitlement decision. Treating a browser callback as payment truth would let
client-controlled input unlock fulfilment. Treating webhook arrival order as truth would also be
unsafe because Razorpay documents retries, duplicates, and out-of-order delivery.

Order creation has a different ambiguity: a timed-out POST may have reached the provider. Blindly
retrying it can create more than one external attempt, while creating the provider order before a
budget reservation can charge a transaction that policy did not authorize.

## Decision

SignalWorks owns the Razorpay Test Mode key ID, key secret, webhook secrets, direct REST client, and
provider order lifecycle. MindPay never receives the Razorpay key secret. The Gateway sends a
machine-authenticated, typed payment authorization only after the transaction is
`BUDGET_RESERVED`; it binds transaction, agent, mandate hash, checkout hash and session, service,
amount, currency, rail, and attempt number.

SignalWorks claims idempotency and inserts a local `CREATING` row before calling Razorpay. It uses a
stable unique receipt and provider notes for the same authority fields. POSTs are not automatically
retried after ambiguous network failure; bounded retries apply only to safe reads. The browser gets
only the public Test Mode key ID, provider order ID, exact amount/currency, display fields, and a
disabled Checkout retry option.

Callbacks verify HMAC over the server-stored order ID and payment ID. A valid callback records
immutable evidence and moves only to reconciliation; it never makes the payment fulfilment-eligible.

Webhook ingestion verifies HMAC over the exact raw bytes using the current and optional previous
webhook secrets before JSON parsing. It hashes and stores the raw body in private R2, deduplicates
`x-razorpay-event-id` in D1, enqueues only an internal reference, and returns `204` quickly. Queue
processing re-reads and re-hashes the retained body, performs server-side order/payment fetches when
one side is missing, and signs a replay-protected merchant payment event with SignalWorks' event
key.

MindPay verifies that signature, issuer, audience, key lifecycle, nonce, tenant, transaction,
attempt, and provider order. Fulfilment eligibility is the strict conjunction of:

- provider payment status `captured`;
- provider order status `paid`;
- exact order ID, amount, and INR currency matches; and
- an active MindPay spend reservation that can be committed exactly once.

Failure releases the active reservation and records a terminal failed attempt. Retry creates a new
reservation and new provider order only while the mandate attempt limit permits it. The database
therefore uses one partial unique active reservation per transaction rather than one reservation for
the transaction's entire lifetime. A delayed captured event without an active reservation remains
in reconciliation and cannot silently overspend.

Refund mutations and the provider read-only status adapter are disabled by default and separately
feature-flagged. The direct typed REST integration remains authoritative; optional read-only tooling
cannot become a fulfilment dependency.

## Consequences

- Blocked, approval-pending, and unreserved transactions make zero Razorpay requests.
- Browser compromise cannot expose the key secret or turn a callback into an entitlement.
- Duplicate delivery is harmless and raw provider evidence remains available for audit.
- Paid-before-captured, captured-before-paid, missing-callback, and callback-first flows converge by
  reconciliation instead of arrival order.
- A final failed attempt cannot reserve again or create another provider order.
- Real Test Mode success/failure remains an external credentialed release check; deterministic CI
  uses provider-faithful fixtures and the same D1/R2/queue/state boundaries.
