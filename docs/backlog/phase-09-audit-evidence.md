# Phase 9: Audit, realtime events, and evidence

Source: `Mindpay.md`, implementation Phase 9.

## Exit gate

Successful, blocked, and failed transactions produce complete signed evidence; any event or bundle mutation fails public verification without leaking secrets.

## Tickets

### MP-0901: Implement concurrency-safe append-only audit chains

- Priority: Critical
- Status: Ready
- Depends on: MP-0104, MP-0201
- Size: 1-3 engineering days

**Outcome**

Create the shared append function with redaction, canonical payload hash, ordered previous hash, platform signature, and immutable insert.

**Acceptance criteria**

- [ ] Concurrent events receive unique contiguous sequence numbers.
- [ ] Changing any prior payload, timestamp, actor, type, or link breaks verification.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-0902: Cover every money and transaction transition with audit events

- Priority: Critical
- Status: Ready
- Depends on: MP-0608, MP-0707, MP-0807, MP-0901
- Size: 1-3 engineering days

**Outcome**

Centralize state mutations so required intent, offer, policy, approval, reservation, payment, entitlement, fulfilment, and completion events cannot be skipped.

**Acceptance criteria**

- [ ] Success, block, and payment-failure flows contain every required event in legal order.
- [ ] No money state transition can commit if its audit append fails.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-0903: Implement Durable Object transaction event streaming

- Priority: High
- Status: Ready
- Depends on: MP-0901
- Size: 1-3 engineering days

**Outcome**

Broadcast committed audit-derived events with WebSocket hibernation and reconnect support.

**Acceptance criteria**

- [ ] D1 remains canonical and clients refetch after reconnect.
- [ ] A dropped or duplicated stream message cannot change displayed canonical state after refetch.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-0904: Build signed evidence bundles and private storage jobs

- Priority: Critical
- Status: Ready
- Depends on: MP-0902
- Size: 1-3 engineering days

**Outcome**

Assemble versioned transaction, mandate, agent, merchant, policy, risk, payment, fulfilment, and audit proofs; canonicalize, hash, sign, and store them.

**Acceptance criteria**

- [ ] Successful, blocked, and failed terminal flows produce evidence.
- [ ] Bundle jobs are idempotent and never expose private R2 objects directly.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-0905: Implement the public evidence verifier and redacted download

- Priority: Critical
- Status: Ready
- Depends on: MP-0904
- Size: 1-3 engineering days

**Outcome**

Verify bundle signature, audit links, merchant checkout, delivery receipt, and proof status on `/verify/:evidence_id`.

**Acceptance criteria**

- [ ] Each proof displays an independent pass/fail result.
- [ ] Prompts, PII, secrets, raw signatures, and raw payment payloads are absent from public output.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-0906: Complete tamper, redaction, and evidence-chain tests

- Priority: Critical
- Status: Ready
- Depends on: MP-0905
- Size: 1-3 engineering days

**Outcome**

Mutate each proof family and prove the verifier fails closed while valid bundles remain portable.

**Acceptance criteria**

- [ ] Event, checkout, receipt, and bundle mutations are independently detected.
- [ ] Snapshot tests prove the redacted schema contains no forbidden field classes.
- [ ] Affected checks pass and `docs/status.md` is updated.

## Phase completion

- [ ] Every ticket above is Done.
- [ ] The exit gate is demonstrated in CI or a reproducible verification record.
- [ ] Architecture changes are recorded in `docs/adr/`.

