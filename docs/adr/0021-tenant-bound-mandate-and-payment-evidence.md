# ADR-0021: Tenant-bound mandate and payment evidence

- Status: Accepted
- Date: 2026-08-30
- Decision owners: MindPay engineering

## Context

Phase 6 needs durable open mandates before lifecycle APIs, deterministic policy, step-up approval,
and atomic budget operations can be implemented. A foreign key by itself is insufficient for a
multi-tenant payment system: a child row can reference a real mandate or transaction owned by a
different organization. The same records are security and payment evidence, so routine tenant or
parent cleanup must not silently cascade-delete them.

The protocol contracts also use separate open checkout and open payment mandate objects. The
database therefore needs a typed discriminator and the canonical payload, while keeping payment
bounds queryable for atomic policy and reservation operations.

## Decision

Store each open protocol mandate as one `mandates` row with its exact schema version, canonical
payload and hash, immutable agent/user binding, explicit checkout or payment kind, lifecycle state,
and an indexed retention deadline. Payment mandate limits and counters are stored as integer INR
subunits; checkout-only rows are required to leave those columns empty. Database checks reject any
row that mixes the two shapes or violates threshold, transaction, attempt, budget, or time bounds.

Persist proofs, transaction approvals, consumed nonces, spend reservations, payment attempts, and
provider events in separate organization-owned tables. Transactions provide the common tenant and
commerce parent. D1 insert triggers verify organization, user, agent version, mandate, transaction,
service, challenge, credential, amount, and attempt-limit relationships across those parents.

Signed payloads, identities, amounts, scopes, and external event identities are immutable after
insertion. Lifecycle and processing fields remain updateable where later tickets require legal state
transitions. Retention can be extended but not shortened. Every new table has a retention index and
a delete trigger that blocks removal before the deadline; parent references use `RESTRICT`.

Duplicate active approvals use a partial unique index over organization, transaction, and canonical
payload hash. Consumed nonces are unique per organization, scope, and nonce. Provider events are
globally unique per provider and event ID, and payment attempts are unique per transaction ordinal.

## Consequences

- MP-0602 can build lifecycle APIs without changing the canonical persistence shape.
- MP-0606 can consume one session-bound challenge into one active logical approval.
- MP-0607 can reserve against directly queryable payment limits and preserve the reservation row as
  evidence.
- MP-0704 can ingest provider events idempotently while keeping raw payload bytes outside D1 under a
  private R2 key.
- Data erasure needs an explicit retention-expiry workflow; deleting an organization or parent row
  cannot bypass payment-evidence retention.
- Application code still owns canonical contract validation and legal transition tables. Database
  constraints are a second boundary for storage integrity, not a replacement for protocol checks.
