# Phase 1: Shared contracts, cryptography, and protocol schemas

Source: `Mindpay.md`, implementation Phase 1.

## Exit gate

Malformed fixtures are rejected, one-byte signature mutations fail, canonical JSON matches golden vectors, and ACP conformance fixtures pass.

## Tickets

### MP-0101: Implement ULID, money, time, and request primitives

- Priority: Critical
- Status: Done
- Depends on: MP-0007
- Size: 1-3 engineering days

**Outcome**

Create strict domain primitives for IDs, integer currency subunits, UTC timestamps, request IDs, and idempotency keys.

**Acceptance criteria**

- [x] Fractional, unsafe, negative, or wrong-currency money inputs are rejected.
- [x] Property tests cover serialization and boundary values.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0102: Implement RFC 8785-compatible canonical JSON

- Priority: Critical
- Status: Done
- Depends on: MP-0101
- Size: 1-3 engineering days

**Outcome**

Produce deterministic JSON bytes for every signed or hashed MindPay object.

**Acceptance criteria**

- [x] Golden vectors are byte-identical across repeated runs.
- [x] Key order changes preserve the canonical bytes while value mutations change them.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0103: Implement SHA-256, HMAC, and timing-safe comparison

- Priority: Critical
- Status: Done
- Depends on: MP-0102
- Size: 1-3 engineering days

**Outcome**

Create Worker-compatible hashing and MAC verification helpers with no Node-only crypto dependency.

**Acceptance criteria**

- [x] Official or independently calculated vectors pass.
- [x] Invalid signatures and unequal-length inputs fail without ordinary string comparison.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0104: Implement ES256 signing, key rotation, and AES-GCM key encryption

- Priority: Critical
- Status: Done
- Depends on: MP-0103
- Size: 1-3 engineering days

**Outcome**

Support signed objects, `kid` selection, revoked-key rejection, and encrypted private agent keys.

**Acceptance criteria**

- [x] A one-byte payload mutation and a revoked key both fail verification.
- [x] AES-GCM round trips and fails on tampered ciphertext or associated data.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0105: Define merchant manifest, catalog, service, and checkout contracts

- Priority: Critical
- Status: Ready
- Depends on: MP-0102
- Size: 1-3 engineering days

**Outcome**

Create strict Zod/JSON Schema contracts for merchant identity, signed catalogs, immutable service versions, offers, and checkout payloads.

**Acceptance criteria**

- [ ] Unknown fields, floating prices, invalid origins, and unstable identifiers are rejected.
- [ ] Representative valid SignalWorks fixtures pass.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-0106: Define mandate, merchant-event, audit, entitlement, and evidence contracts

- Priority: Critical
- Status: Ready
- Depends on: MP-0104, MP-0105
- Size: 1-3 engineering days

**Outcome**

Freeze the versioned cross-party objects used by policy, payment, fulfilment, and public verification.

**Acceptance criteria**

- [ ] Every signed object requires issuer, audience, `kid`, issue/expiry time, and nonce or `jti`.
- [ ] Schemas reject missing proof bindings and inconsistent amount/currency fields.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-0107: Vendor and verify ACP 2026-04-17

- Priority: Critical
- Status: Ready
- Depends on: MP-0105
- Size: 1-3 engineering days

**Outcome**

Vendor the pinned official ACP snapshot with provenance, checksums, generated types, and conformance fixtures.

**Acceptance criteria**

- [ ] The repository contains no floating ACP dependency or newer schema under the pinned path.
- [ ] Official examples validate and intentionally malformed examples fail.
- [ ] Affected checks pass and `docs/status.md` is updated.

## Phase completion

- [ ] Every ticket above is Done.
- [ ] The exit gate is demonstrated in CI or a reproducible verification record.
- [ ] Architecture changes are recorded in `docs/adr/`.
