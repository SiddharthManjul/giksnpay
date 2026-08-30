# Phase 3: SignalWorks merchant reference implementation

Source: `Mindpay.md`, implementation Phase 3.

## Exit gate

MindPay verifies the signed manifest and catalog, ACP checkout operations are idempotent, mutated payloads fail, and service versions are immutable.

## Tickets

### MP-0301: Create SignalWorks merchant identity and signing-key lifecycle

- Priority: Critical
- Status: Done
- Depends on: MP-0104, MP-0201
- Size: 1-3 engineering days

**Outcome**

Seed merchant identity and separate manifest, catalog, checkout, and event signing purposes with rotation metadata.

**Acceptance criteria**

- [x] Public JWKs expose no private material and revoked keys cannot sign new objects.
- [x] Local seed execution is idempotent and produces stable merchant identity.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0302: Publish the signed well-known manifest

- Priority: Critical
- Status: Done
- Depends on: MP-0301
- Size: 1-3 engineering days

**Outcome**

Serve `/.well-known/mindpay.json` with exact origin, endpoint, rail, expiry, and key metadata.

**Acceptance criteria**

- [x] Canonical signature verification succeeds from MindPay contract tests.
- [x] Redirects, domain mismatch, expiry, or a one-byte change cause rejection.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0303: Publish the signed three-service catalog

- Priority: Critical
- Status: Done
- Depends on: MP-0301, MP-0105
- Size: 1-3 engineering days

**Outcome**

Expose immutable versions for ₹299, ₹449, and ₹799 SignalWorks services with fulfilment bindings.

**Acceptance criteria**

- [x] Prices are integer paise and all service IDs remain stable across refreshes.
- [x] Changing a published version fails at the persistence boundary.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0304: Implement the ACP checkout state machine

- Priority: Critical
- Status: Done
- Depends on: MP-0107, MP-0302, MP-0303
- Size: 1-3 engineering days

**Outcome**

Implement create, update, get, complete, and cancel checkout endpoints with authoritative signed state.

**Acceptance criteria**

- [x] Every response validates against the pinned ACP schema.
- [x] Illegal transitions return `409` without altering stored checkout state.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0305: Implement merchant idempotency and request authentication

- Priority: Critical
- Status: Done
- Depends on: MP-0304
- Size: 1-3 engineering days

**Outcome**

Protect every ACP mutation with bearer auth, API version, request ID, and payload-bound idempotency.

**Acceptance criteria**

- [x] Same key and request returns the stored response; changed input returns `409`.
- [x] Expired or invalid machine credentials are rejected before any write.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0306: Implement signed outbound merchant events and key rotation behavior

- Priority: Critical
- Status: Done
- Depends on: MP-0301, MP-0304
- Size: 1-3 engineering days

**Outcome**

Emit replay-protected signed order lifecycle events with timestamp, nonce, and event key ID.

**Acceptance criteria**

- [x] MindPay verifies a valid event and rejects replay, expiry, and unknown keys.
- [x] A planned key rotation accepts the overlap window without accepting revoked keys.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0307: Seed merchant services and complete contract/integration tests

- Priority: High
- Status: Done
- Depends on: MP-0302, MP-0303, MP-0305, MP-0306
- Size: 1-3 engineering days

**Outcome**

Provide the repeatable SignalWorks seed command and close the merchant contract surface with tests.

**Acceptance criteria**

- [x] A fresh merchant database reaches the same manifest, catalog, and service versions.
- [x] Gateway-to-merchant contract tests pass without Razorpay credentials.
- [x] Affected checks pass and `docs/status.md` is updated.

## Phase completion

- [x] Every ticket above is Done.
- [x] The exit gate is demonstrated in CI or a reproducible verification record.
- [x] Architecture changes are recorded in `docs/adr/`.
