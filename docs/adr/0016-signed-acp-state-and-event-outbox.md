# ADR-0016: Signed ACP state, authenticated idempotency, and merchant event outbox

- Status: Accepted
- Date: 2026-08-30
- Tickets: MP-0304, MP-0305, MP-0306, MP-0307

## Context

SignalWorks must expose the pinned ACP checkout API while retaining authority over price, service
version, checkout state, and order creation. ACP response objects reject unknown properties, so a
MindPay signature envelope cannot be added to the JSON body without breaking ACP conformance.
Machine retries must also be safe across Worker restarts, and order lifecycle events must survive a
failed downstream delivery without letting replay or key rotation weaken verification.

## Decision

Persist the complete ACP response, its canonical SHA-256 hash, a detached ES256 signature, and the
canonical MindPay merchant-checkout payload and signature in SignalWorks D1. Return the ACP object
unchanged in the response body and carry the proofs in bounded base64url response headers:

- `X-MindPay-ACP-Signature` signs the exact authoritative ACP body;
- `X-MindPay-Checkout` carries the strict merchant checkout used by later mandate binding; and
- `X-MindPay-Checkout-Signature` signs that checkout with the checkout-purpose key.

Only `ready_for_payment` sessions may update, complete, or cancel. Conditional revision updates and
database batches keep terminal transitions immutable. Completing a checkout creates an ACP order
record only; Razorpay capture remains Phase 7 work.

Authenticate all ACP methods with a hashed, expiring, revocable bearer credential. Require the
pinned `API-Version` and `Request-Id`, and require `Idempotency-Key` on every mutation. Scope an
idempotency record to credential, method, and endpoint and bind it to canonical request JSON. A
matching retry receives the stored status, body, and proof headers; changed input fails with `409`.
Authentication is read-only and completes before any idempotency or checkout write.

Write a strict signed order-lifecycle event to an immutable D1 outbox for each accepted mutation.
Each event contains issuance, occurrence, expiry, nonce, state hash, event key ID, and exact merchant
and checkout identities. The shared MindPay verifier validates schema, audience, issuer, expected
merchant identity, lifetime, event-purpose key lifecycle, signature, and a caller-provided atomic
replay claim. Planned rotation
allows both keys only during their declared overlap; revocation always wins.

## Consequences

- ACP bodies remain byte-for-byte conformant to the vendored `2026-04-17` schema.
- A changed ACP response or merchant checkout fails canonical signature verification.
- Machine-token plaintext, payment credentials, and private signing material are never persisted in
  checkout or idempotency records.
- The event outbox is durable and immutable but delivery scheduling is deferred to the later event
  ingestion/reconciliation phase.
- Key and response proofs are detached canonical ES256 envelopes rather than compact JWT strings;
  this preserves the repository's purpose-isolated key lifecycle and RFC 8785 signing boundary.

## Verification

`pnpm verify:phase-03` reproduces the ACP snapshot checks, strict shared contracts, real Miniflare D1
migrations, the full checkout state machine, authentication-before-write, exact idempotent replay,
changed-input rejection, signature mutation failure, event replay/lifetime/key rejection, rotation
overlap, immutable service versions, and independent fresh-database seeds.
