# Phase 2: Database, authentication, and tenancy

Source: `Mindpay.md`, implementation Phase 2.

## Exit gate

Users can enter a demo workspace, role and object authorization is enforced, passkeys register on HTTPS, and audit rows cannot be mutated.

## Tickets

### MP-0201: Create Drizzle/D1 schemas, migrations, and integrity constraints

- Priority: Critical
- Status: Done
- Depends on: MP-0106
- Size: 1-3 engineering days

**Outcome**

Implement the Phase 2 identity, tenancy, replay, approval, idempotency, and audit foundations in D1.

**Acceptance criteria**

- [x] Migrations apply to an empty local D1 database and reproduce the same schema.
- [x] Unique indexes and append-only audit triggers reject duplicates, updates, and deletes.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0202: Integrate Better Auth with D1

- Priority: Critical
- Status: Done
- Depends on: MP-0201
- Size: 1-3 engineering days

**Outcome**

Provide secure account, session, verification, and sign-in flows compatible with Cloudflare Workers.

**Acceptance criteria**

- [x] A user can sign in, refresh, sign out, and cannot reuse an invalidated session.
- [x] Auth secrets and session tokens never appear in logs or browser bundles.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0203: Implement organisations, memberships, and role authorization

- Priority: Critical
- Status: Done
- Depends on: MP-0202
- Size: 1-3 engineering days

**Outcome**

Enforce OWNER, ADMIN, BUILDER, REVIEWER, and VIEWER capabilities at route and object boundaries.

**Acceptance criteria**

- [x] Each role has explicit allow/deny integration tests.
- [x] Cross-organisation object access returns a non-enumerating authorization error.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0204: Implement passkey registration and credential management

- Priority: Critical
- Status: Done
- Depends on: MP-0202
- Size: 1-3 engineering days

**Outcome**

Register and store WebAuthn public credentials for later mandate and step-up proofs.

**Acceptance criteria**

- [x] Registration challenges expire, bind to the session and origin, and are single use.
- [x] A valid authenticator registration is persisted without private key material.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0205: Harden cookies, CSRF, CORS, and auth rate limits

- Priority: Critical
- Status: Done
- Depends on: MP-0202
- Size: 1-3 engineering days

**Outcome**

Apply browser and API controls before exposing authenticated mutation routes.

**Acceptance criteria**

- [x] Cross-origin credentialed requests outside the allowlist fail.
- [x] CSRF, session fixation, and replay tests pass for all auth mutations.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0206: Provision isolated demo workspaces

- Priority: High
- Status: Done
- Depends on: MP-0203, MP-0204
- Size: 1-3 engineering days

**Outcome**

Create an idempotent demo entry flow with an organisation, owner membership, and expiry metadata.

**Acceptance criteria**

- [x] Repeated provisioning with the same idempotency key returns the same workspace.
- [x] One demo user cannot read or mutate another demo workspace.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0207: Complete tenancy and authentication security tests

- Priority: Critical
- Status: Done
- Depends on: MP-0201, MP-0203, MP-0205, MP-0206
- Size: 1-3 engineering days

**Outcome**

Close Phase 2 with migration, RBAC, passkey, BOLA, CSRF, and session security coverage.

**Acceptance criteria**

- [x] The Phase 2 security suite passes against local Worker and D1 instances.
- [x] `docs/status.md` and any auth/storage ADRs reflect the verified implementation.
- [x] Affected checks pass and `docs/status.md` is updated.

## Phase completion

- [x] Every ticket above is Done.
- [x] The exit gate is demonstrated in CI or a reproducible verification record.
- [x] Architecture changes are recorded in `docs/adr/`.
