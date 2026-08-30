# Phase 4: Marketplace and merchant verification

Source: `Mindpay.md`, implementation Phase 4.

## Exit gate

Only approved merchants are agent-discoverable; material changes trigger review or quarantine; catalog cache changes follow signed version changes.

## Tickets

### MP-0401: Implement merchant onboarding and review administration

- Priority: High
- Status: Done
- Depends on: MP-0203, MP-0302
- Size: 1-3 engineering days

**Outcome**

Create role-protected submission, review, suspend, and reverification APIs.

**Acceptance criteria**

- [x] Only authorized reviewers can change verification state.
- [x] Every administration mutation is idempotent and audited.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0402: Implement domain, manifest, key, endpoint, and catalog verification

- Priority: Critical
- Status: Done
- Depends on: MP-0307, MP-0401
- Size: 1-3 engineering days

**Outcome**

Verify HTTPS origins, redirect policy, signatures, expiry, stable IDs, INR prices, tools, and payment rail.

**Acceptance criteria**

- [x] Private-network, cross-origin, malformed, expired, and unsigned inputs fail closed.
- [x] Each failed check emits a stable machine-readable reason.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0403: Implement verification state, quarantine, and reverification

- Priority: Critical
- Status: Done
- Depends on: MP-0402
- Size: 1-3 engineering days

**Outcome**

Enforce the merchant verification state machine and automatic actions for safe versus material changes.

**Acceptance criteria**

- [x] Key/domain/payment changes move an approved merchant to `REVIEW_REQUIRED`.
- [x] Signature failures quarantine discovery immediately.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0404: Index verified services and maintain the KV cache

- Priority: High
- Status: Done
- Depends on: MP-0402, MP-0403
- Size: 1-3 engineering days

**Outcome**

Persist verified catalog versions in D1 and cache public search documents in KV.

**Acceptance criteria**

- [x] Unverified or quarantined services never enter search results.
- [x] A signed catalog version change invalidates stale cache entries.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0405: Expose typed marketplace and trust-detail APIs

- Priority: High
- Status: Done
- Depends on: MP-0404
- Size: 1-3 engineering days

**Outcome**

Implement service search, service detail, and merchant trust endpoints from canonical verified state.

**Acceptance criteria**

- [x] Filters and pagination are schema-validated and deterministic.
- [x] Responses expose verification time, tier, rail, protocol, and fulfilment without secrets.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0406: Add continuous verification and marketplace failure tests

- Priority: Critical
- Status: Done
- Depends on: MP-0403, MP-0405
- Size: 1-3 engineering days

**Outcome**

Trigger rechecks on material changes and prove discovery fails safely during verification incidents.

**Acceptance criteria**

- [x] Catalog changes re-index; key/domain changes review; signature failure quarantines.
- [x] Contract and integration tests cover redirect, SSRF, replay, and cache invalidation.
- [x] Affected checks pass and `docs/status.md` is updated.

## Phase completion

- [x] Every ticket above is Done.
- [x] The exit gate is demonstrated in CI or a reproducible verification record.
- [x] Architecture changes are recorded in `docs/adr/`.
