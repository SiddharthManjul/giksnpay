# Phase 2: Database, authentication, and tenancy

Source: `Mindpay.md`, implementation Phase 2.

## Exit gate

Users can enter a demo workspace, role and object authorization is enforced, passkeys register on HTTPS, and audit rows cannot be mutated.

## Tickets

### MP-0201: Create Drizzle/D1 schemas, migrations, and integrity constraints

- Priority: Critical
- Status: Ready
- Depends on: MP-0106
- Size: 1-3 engineering days

**Outcome**

Implement the Phase 2 identity, tenancy, replay, approval, idempotency, and audit foundations in D1.

**Acceptance criteria**

- [ ] Migrations apply to an empty local D1 database and reproduce the same schema.
- [ ] Unique indexes and append-only audit triggers reject duplicates, updates, and deletes.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-0202: Integrate Better Auth with D1

- Priority: Critical
- Status: Ready
- Depends on: MP-0201
- Size: 1-3 engineering days

**Outcome**

Provide secure account, session, verification, and sign-in flows compatible with Cloudflare Workers.

**Acceptance criteria**

- [ ] A user can sign in, refresh, sign out, and cannot reuse an invalidated session.
- [ ] Auth secrets and session tokens never appear in logs or browser bundles.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-0203: Implement organisations, memberships, and role authorization

- Priority: Critical
- Status: Ready
- Depends on: MP-0202
- Size: 1-3 engineering days

**Outcome**

Enforce OWNER, ADMIN, BUILDER, REVIEWER, and VIEWER capabilities at route and object boundaries.

**Acceptance criteria**

- [ ] Each role has explicit allow/deny integration tests.
- [ ] Cross-organisation object access returns a non-enumerating authorization error.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-0204: Implement passkey registration and credential management

- Priority: Critical
- Status: Ready
- Depends on: MP-0202
- Size: 1-3 engineering days

**Outcome**

Register and store WebAuthn public credentials for later mandate and step-up proofs.

**Acceptance criteria**

- [ ] Registration challenges expire, bind to the session and origin, and are single use.
- [ ] A valid authenticator registration is persisted without private key material.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-0205: Harden cookies, CSRF, CORS, and auth rate limits

- Priority: Critical
- Status: Ready
- Depends on: MP-0202
- Size: 1-3 engineering days

**Outcome**

Apply browser and API controls before exposing authenticated mutation routes.

**Acceptance criteria**

- [ ] Cross-origin credentialed requests outside the allowlist fail.
- [ ] CSRF, session fixation, and replay tests pass for all auth mutations.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-0206: Provision isolated demo workspaces

- Priority: High
- Status: Ready
- Depends on: MP-0203, MP-0204
- Size: 1-3 engineering days

**Outcome**

Create an idempotent demo entry flow with an organisation, owner membership, and expiry metadata.

**Acceptance criteria**

- [ ] Repeated provisioning with the same idempotency key returns the same workspace.
- [ ] One demo user cannot read or mutate another demo workspace.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-0207: Complete tenancy and authentication security tests

- Priority: Critical
- Status: Ready
- Depends on: MP-0201, MP-0203, MP-0205, MP-0206
- Size: 1-3 engineering days

**Outcome**

Close Phase 2 with migration, RBAC, passkey, BOLA, CSRF, and session security coverage.

**Acceptance criteria**

- [ ] The Phase 2 security suite passes against local Worker and D1 instances.
- [ ] `docs/status.md` and any auth/storage ADRs reflect the verified implementation.
- [ ] Affected checks pass and `docs/status.md` is updated.

## Phase completion

- [ ] Every ticket above is Done.
- [ ] The exit gate is demonstrated in CI or a reproducible verification record.
- [ ] Architecture changes are recorded in `docs/adr/`.

