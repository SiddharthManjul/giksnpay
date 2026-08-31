# ADR-0022: Deterministic commerce authority and atomic budget closure

- Status: Accepted
- Date: 2026-08-30
- Decision owners: MindPay engineering

## Context

Phase 6 turns a signed purchase proposal into a payment-eligible transaction. An agent or model can
help select and explain a service, but it cannot be allowed to decide whether a merchant signature,
mandate constraint, approval, or budget is valid. A read-then-write budget check is also unsafe:
two valid concurrent requests can both observe available funds and overspend when they later insert
separate reservations.

Passkey step-up has a similar binding problem. A valid assertion for one session, origin, or payload
must never authorize a different closed mandate, and a failed or successful assertion must not be
replayable. At the same time, an expired challenge must not prevent the user from safely requesting
a replacement for the same canonical payload.

## Decision

Use three versioned deterministic boundaries:

1. The mandate protocol maps exact MindPay `mindpay.mandate.*.1` objects to AP2 concepts under the
   label `AP2_ALIGNED_NOT_CONFORMANT`. Agent-closed checkout and payment mandates are canonicalized,
   hashed, signed with the published agent key, and rejected if any open constraint expands.
2. The policy engine executes the documented checks in stable order and returns immutable typed
   reasons. The risk engine evaluates versioned block and review rules. Optional model signals are
   evidence only and cannot change either deterministic outcome.
3. D1 owns the final budget compare-and-update. A `BEFORE INSERT` reservation trigger increments
   `reserved_subunits` only while the mandate is active, unexpired, within its per-transaction and
   transaction-count limits, and within `spent + reserved + amount <= budget`. Failure aborts the
   reservation row and counter update together. Commit, release, and expiry triggers close one
   reservation exactly once and update counters in the same statement.

WebAuthn challenges sign the exact canonical open- or closed-mandate hash and persist its hash beside
the session, user, organization, RP ID, origin, credential, mandate, and optional transaction. The
challenge is claimed once before verification. Transaction approval rechecks the active mandate and
budget after assertion verification. Only pending challenges are unique by challenge hash, allowing
an expired or consumed challenge to be replaced without weakening single-use enforcement.

No Phase 6 endpoint invokes payment-order creation. `ALLOW` and successfully approved results stop
at `BUDGET_RESERVED`; Phase 7 owns the first Razorpay side effect.

## Consequences

- ₹299 can reserve automatically, ₹449 cannot reserve until exact passkey step-up, and ₹799 cannot
  produce a payment order because it exceeds the open mandate.
- Revocation or expiry wins any race before reservation insertion; the database trigger rejects the
  later reservation even if application policy evaluated moments earlier.
- Model output can explain deterministic evidence but cannot change recipient, amount, rail,
  reasons, approval state, or reservation.
- Reservation consumers in Phase 7 must use the exported exactly-once commit/release operations and
  periodically expire stale reservations.
- MindPay remains AP2-aligned, not AP2- or SD-JWT-conformant, until those formats and conformance
  suites are intentionally implemented.
