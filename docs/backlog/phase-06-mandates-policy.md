# Phase 6: Mandates, policy, and risk

Source: `Mindpay.md`, implementation Phase 6.

## Exit gate

₹299 auto-approves, ₹449 requires a valid passkey approval, ₹799 blocks, revoked mandates cannot order, and concurrent reservations cannot exceed budget.

## Tickets

### MP-0601: Implement mandate, proof, approval, replay, and payment-attempt persistence

- Priority: Critical
- Status: Ready
- Depends on: MP-0201, MP-0106
- Size: 1-3 engineering days

**Outcome**

Complete the data model needed for open mandates, transaction approvals, consumed nonces, spend reservations, and bounded attempts.

**Acceptance criteria**

- [ ] Indexes prevent duplicate active logical approvals, nonces, and provider events.
- [ ] Every table has explicit retention and tenant ownership behavior.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-0602: Implement mandate builder and lifecycle APIs

- Priority: Critical
- Status: Ready
- Depends on: MP-0601, MP-0204
- Size: 1-3 engineering days

**Outcome**

Create, inspect, activate, suspend, revoke, expire, and exhaust bounded mandates.

**Acceptance criteria**

- [ ] Activation verifies a passkey proof over the canonical mandate hash.
- [ ] Revoked or expired mandates fail before budget reservation.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-0603: Implement AP2-aligned open and closed mandate mapping

- Priority: Critical
- Status: Ready
- Depends on: MP-0106, MP-0602
- Size: 1-3 engineering days

**Outcome**

Sign agent-closed checkout and payment mandates bound to the merchant checkout hash, amount, payee, and rail.

**Acceptance criteria**

- [ ] Closed mandates cannot expand any open constraint.
- [ ] Version identifiers use `mindpay.mandate.*.1` and make no unsupported conformance claim.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-0604: Implement the deterministic policy engine

- Priority: Critical
- Status: Ready
- Depends on: MP-0405, MP-0603
- Size: 1-3 engineering days

**Outcome**

Execute all policy checks in the specified stable order and return typed allow, approval, or block reasons.

**Acceptance criteria**

- [ ] Signature, expiry, amount, currency, payee, rail, service version, nonce, and budget mismatches block.
- [ ] The model cannot alter a policy decision or its machine-readable reasons.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-0605: Implement the deterministic risk engine

- Priority: Critical
- Status: Ready
- Depends on: MP-0403, MP-0604
- Size: 1-3 engineering days

**Outcome**

Add versioned block and review rules with evidence-bearing reason codes and optional non-authoritative model signals.

**Acceptance criteria**

- [ ] Every deterministic block produces `BLOCK` regardless of model output.
- [ ] Review rules cannot silently become allow decisions.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-0606: Implement transaction step-up passkey approval

- Priority: Critical
- Status: Ready
- Depends on: MP-0604, MP-0605
- Size: 1-3 engineering days

**Outcome**

Approve the exact canonical closed-mandate hash with an expiring, session-bound, single-use WebAuthn challenge.

**Acceptance criteria**

- [ ] ₹449 remains `APPROVAL_REQUIRED` until a valid assertion is verified.
- [ ] Replayed, wrong-origin, expired, or different-payload assertions fail.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-0607: Implement atomic spend reservation, commit, release, and expiry

- Priority: Critical
- Status: Ready
- Depends on: MP-0604
- Size: 1-3 engineering days

**Outcome**

Reserve budget before order creation and close the reservation exactly once after terminal payment outcomes.

**Acceptance criteria**

- [ ] Reservation update and row creation are atomic.
- [ ] Concurrent transactions cannot make spent plus reserved exceed total budget.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-0608: Complete policy, risk, state, and concurrency tests

- Priority: Critical
- Status: Ready
- Depends on: MP-0606, MP-0607
- Size: 1-3 engineering days

**Outcome**

Prove the default mandate, illegal transitions, replay protection, and budget races before payment integration.

**Acceptance criteria**

- [ ] ₹299 allows, ₹449 reviews, and ₹799 blocks with no order creation hook invoked.
- [ ] Property and integration tests cover concurrent reservation, revoke-during-checkout, and idempotency mismatch.
- [ ] Affected checks pass and `docs/status.md` is updated.

## Phase completion

- [ ] Every ticket above is Done.
- [ ] The exit gate is demonstrated in CI or a reproducible verification record.
- [ ] Architecture changes are recorded in `docs/adr/`.

