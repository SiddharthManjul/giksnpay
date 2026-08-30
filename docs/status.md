# MindPay implementation status

Last updated: 2026-08-30

## Current phase

Phases 0 through 4 are complete. The next ticket is MP-0501, agent CRUD and immutable versioning.

## Phase progress

| Phase | Status | Exit gate |
|---|---|---|
| 0. Repository and guardrails | Complete | All workspaces build; format, lint, typecheck, and tests pass |
| 1. Contracts, crypto, and protocols | Complete | Schema and cryptographic conformance tests pass |
| 2. Database, auth, and tenancy | Complete | Auth, roles, passkeys, and audit immutability pass |
| 3. SignalWorks merchant | Complete | Signed manifest, catalog, and ACP checkout pass |
| 4. Marketplace and verification | Complete | Only verified services are discoverable |
| 5. Agents and runtime | Not started | Typed approved tools and manual fallback work |
| 6. Mandates, policy, and risk | Not started | ₹299 allows, ₹449 reviews, and ₹799 blocks |
| 7. Razorpay Test Mode | Not started | Success, failure, deduplication, and reconciliation pass |
| 8. Entitlements and MCP | Not started | A paid entitlement redeems exactly once |
| 9. Audit and evidence | Not started | Public verification detects any mutation |
| 10. Frontend completion | Not started | Critical flows work accessibly on supported viewports |
| 11. Hardening and reliability | Not started | Security, eval, chaos, and performance targets pass |
| 12. Deployment and submission | Not started | Public demo and clean-room setup pass |

## Phase 0 result

- Git repository initialized on `main`.
- pnpm/Turborepo workspace and strict TypeScript configuration created.
- Web, Gateway, and SignalWorks application shells created.
- Shared package boundaries and environment validation scaffolded.
- CI, Playwright, Vitest, Biome, documentation, and ADR foundations created.
- The 13 delivery epics are decomposed into 96 dependency-ordered tickets.
- Frozen install, full static/test gate, all production builds, OpenNext Cloudflare build, and the
  Playwright smoke test pass.

Verification record: `docs/verification/phase-00.md`.

## Phase 1 activity

### MP-0101 complete

- Added branded canonical ULIDs, `req_` request IDs, and bounded idempotency keys.
- Added exact INR money parsing, formatting, arithmetic, comparison, and safe-integer enforcement.
- Added canonical millisecond-precision UTC timestamps, clock injection, duration arithmetic, and
  comparison.
- Added 52 unit and property tests covering invalid boundaries, serialization round trips, and
  ordering behavior.
- Verified `pnpm check` and `pnpm build` across all workspaces.

### MP-0102 complete

- Added strict RFC 8785-compatible canonical string and UTF-8 byte serialization.
- Added fail-closed rejection for invalid numbers and Unicode, non-JSON values, sparse arrays,
  accessors, hidden or symbol properties, non-plain objects, and cycles.
- Added 20 golden, adversarial, and property tests covering RFC output, raw UTF-16 key ordering,
  insertion-order independence, mutation detection, and canonicalization idempotence.
- Recorded the signed-data boundary in ADR-0002.
- Verified `pnpm check` and `pnpm build` across all workspaces.

### MP-0103 complete

- Added Worker-native SHA-256 and HMAC-SHA256 byte and hexadecimal helpers using Web Crypto.
- Added canonical JSON hashing so protocol objects reach digests only through the RFC 8785 boundary.
- Added strict hexadecimal encoding, defensive byte conversion, a full-pass byte comparison helper,
  and native Web Crypto HMAC verification for security-sensitive MAC checks.
- Added 21 tests covering NIST SHA-256 and RFC 4231 HMAC vectors, malformed and truncated
  signatures, byte mutations, canonical hash stability, encoding round trips, and unequal lengths.
- Verified `pnpm check` and `pnpm build` across all workspaces.

### MP-0104 complete

- Added Worker-native ES256 key generation, strict public/private JWK import and export, raw
  signatures, and canonical signed-object envelopes binding `alg`, `kid`, and payload.
- Added exact-`kid` verification with planned overlap windows and explicit unknown, inactive,
  expired, revoked, and invalid-signature outcomes; revoked keys cannot sign new objects.
- Added A256GCM private-JWK encryption with runtime-only random IV generation, strict envelopes, and
  domain-separated canonical ownership context as authenticated additional data.
- Added 23 tests covering key round trips, byte mutation, rotation overlap, revocation, malformed
  envelopes, base64url boundaries, the NIST AES-256-GCM vector, and ciphertext/IV/context/key tamper
  failures.
- Recorded the key lifecycle and private-key storage boundary in ADR-0003.
- Verified `pnpm check` and `pnpm build` across all workspaces.

### MP-0105 complete

- Added strict version 1 Zod contracts for merchant identity, P-256 public signing keys, manifests,
  immutable service versions, catalogs, offers, checkout line items, and checkout payloads.
- Added exact public HTTPS-origin checks, canonical stable identifiers and versions, unique key and
  service constraints, integer INR prices, timestamp ordering, and calculated checkout totals.
- Added serializable draft 2020-12 JSON Schema exports with stable MindPay schema IDs.
- Added frozen reference fixtures for the SignalWorks manifest, ₹299/₹449/₹799 catalog, offer, and
  checkout.
- Added 30 tests covering valid fixtures, generated schemas, immutability, unknown fields, private
  JWK leakage, invalid origins, unstable IDs, price boundaries, and cross-field inconsistencies.
- Recorded the public merchant contract boundary in ADR-0004.
- Verified `pnpm check` and `pnpm build` across all workspaces.

### MP-0106 complete

- Added strict signed-object claims requiring canonical issuer and audience URLs, key IDs, UTC
  issuance and expiry, and nonce or JTI replay protection.
- Added all four AP2-aligned MindPay mandate contracts, including immutable agent-key bindings,
  allowlists, integer INR limits, open-mandate hashes, checkout hashes, and closed-mandate links.
- Added signed merchant reconciliation events, hash-linked audit events, one-time entitlements, and
  completed, blocked, or failed public evidence graphs with transaction and proof consistency rules.
- Added draft 2020-12 JSON Schema exports and frozen end-to-end fixtures for the default ₹500
  per-transaction, ₹1,000 budget, ₹350 approval-threshold SignalWorks flow.
- Tightened base and prefixed ULID validation so timestamp-overflow encodings fail at every contract
  boundary.
- Added 62 contract tests covering common signed claims, missing and mismatched proof bindings, INR
  amount consistency, reconciliation facts, entitlement identity, audit-chain links, evidence
  outcomes, generated schemas, strictness, and immutability.
- Recorded the signed cross-party proof graph in ADR-0005.
- Verified `pnpm check` and `pnpm build` across all workspaces.

### MP-0107 complete

- Vendored all 33 official ACP `2026-04-17` OpenAPI, JSON Schema, OpenRPC, example, changelog, and
  license artifacts from immutable upstream commit `7fdd78df677a94dce04c770644b0fbbb1401272b`.
- Recorded the original release commit, last released-path modification, source archive digest, and
  a SHA-256 manifest covering every official vendored file.
- Added deterministic generation of strict TypeScript contracts and embedded runtime schema bundles
  from all seven dated JSON Schema documents; generated code is rejected if it emits explicit
  `any` or becomes stale.
- Added typed Ajv draft 2020-12 validators, type guards, assertions, normalized errors, and public
  ACP version and provenance constants in `@mindpay/protocol-acp`.
- Added 73 tests covering snapshot provenance and integrity, 59 passing official examples, eight
  byte-preserved known upstream example/schema mismatches, and deliberate malformed fixtures.
- Recorded the pinned vendor boundary in ADR-0006 and the Phase 1 exit evidence in
  `docs/verification/phase-01.md`.
- Verified `pnpm check` and `pnpm build` across all workspaces.

## Phase 2 activity

### MP-0201 complete

- Added Better Auth-compatible `user`, `session`, `account`, and `verification` Drizzle schemas for
  the current issuer/account identity model.
- Added organization and membership tables with fixed OWNER, ADMIN, BUILDER, REVIEWER, and VIEWER
  roles, foreign keys, lifecycle checks, and uniqueness constraints.
- Added replay nonce, approval challenge, and request-hash-bound idempotency foundations with
  database-enforced hashes, expiry ordering, state consistency, and single-use uniqueness.
- Added hash-linked audit event storage with unique transaction sequences, event hashes, JTIs, and
  D1 triggers rejecting every update or delete.
- Added the ordered `0000_phase_02_foundation.sql` migration and a local D1 verifier that applies it
  reproducibly to independent empty databases and exercises accepted and rejected integrity cases.
- Recorded the D1 identity and integrity boundary in ADR-0007.
- Verified `pnpm check` and `pnpm build` across all workspaces.

### MP-0202 complete

- Integrated `better-auth/minimal` with the Drizzle D1 adapter at the Gateway's `/api/auth/*`
  boundary and added strict auth URL, secret, environment, and trusted-origin configuration.
- Added namespaced canonical IDs, encrypted OAuth-token storage, hashed verification identifiers,
  explicit cookie attributes, database-backed sessions, and immediate revocation without a cookie
  cache.
- Added a cookie-only browser boundary that recursively removes session and provider credentials
  from auth JSON while preserving HttpOnly cookie headers.
- Added isolated Miniflare/D1 integration coverage for account creation, sign-in, session refresh,
  sign-out, invalidated-cookie rejection, and secret/session-token log leakage.
- Documented local secret provisioning and recorded the auth session boundary in ADR-0008.
- Verified `pnpm check` and `pnpm build` across all workspaces.

### MP-0203 complete

- Added the shared OWNER, ADMIN, BUILDER, REVIEWER, and VIEWER capability matrix for organization,
  membership, agent, and approval actions.
- Added strict shared contracts for the current user, organization access, member lists, role
  mutations, and stable API errors.
- Added authenticated `/api/v1/me` and current-organization read, update, member-list, and member-role
  routes scoped through an explicit organization header.
- Added non-enumerating organization and member lookups so missing and cross-organization objects
  return identical 404 responses while known role denials remain explicit 403 responses.
- Added race-safe D1 triggers that reject deleting or demoting the final organization owner.
- Added real Better Auth and D1 integration coverage with explicit allow and deny cases for every
  role, privileged assignment restrictions, and cross-organization access attempts.
- Recorded the tenancy and authorization boundary in ADR-0009.
- Verified `pnpm check` and `pnpm build` across all workspaces.

### MP-0204 complete

- Added strict RP ID configuration and validation requiring every trusted browser origin to be the
  RP domain or one of its subdomains, with public environments remaining HTTPS-only.
- Added D1 tables for hashed registration challenges and public passkey credential material, with
  ownership, uniqueness, lifecycle, origin, RP ID, and session foreign-key constraints.
- Added authenticated registration options and verification routes using SimpleWebAuthn, required
  resident credentials and user verification, five-minute expiry, exact session/origin binding,
  and atomic consume-before-verify replay protection.
- Added safe credential list, rename, and delete routes that never expose authenticator credential
  IDs, public keys, WebAuthn user handles, counters, or private material.
- Added Miniflare/D1 coverage for expiry, same-user cross-session rejection, trusted cross-origin
  rejection, success and failure replay, public-only persistence, and cross-user management denial.
- Recorded the passkey registration boundary in ADR-0010.
- Verified `pnpm check` and `pnpm build` across all workspaces.

### MP-0205 complete

- Added one fail-closed browser boundary before every `/api/*` route with exact trusted-origin
  matching, credentialed CORS, constrained preflights, Fetch Metadata enforcement, and trusted
  origin requirements for cookie-authenticated mutations.
- Kept originless non-browser requests available while rejecting every supplied untrusted or null
  browser origin before authentication and application handlers run.
- Enabled Better Auth's atomic database rate limiter in every environment with D1 persistence,
  tighter credential mutation rules, `CF-Connecting-IP` as the only client IP source, ignored
  spoofable `X-Forwarded-For`, and IPv6 /64 normalization.
- Added the `rate_limit` schema and ordered migration with unique keys, positive counter checks, and
  stale-row lookup indexing.
- Added adversarial coverage across all exposed core auth mutations plus exact CORS/preflight
  behavior, missing-origin cookies, session fixation, password-change replay, secure host-only
  production cookies, durable counters, and forwarding-header bypass attempts.
- Recorded the browser and abuse-control boundary in ADR-0011.
- Verified `pnpm check` and `pnpm build` across all workspaces.

### MP-0206 complete

- Added authenticated `POST /api/v1/demo-workspaces` with a required canonical idempotency key and
  an optional validated workspace name.
- Bound request hashes and idempotency scopes to the authenticated user, returned the exact stored
  response for sequential and concurrent identical retries, and rejected changed input with 409.
- Provisioned the organization, OWNER membership, 24-hour demo metadata, and completed idempotency
  response in one D1 batch.
- Added the separate `demo_workspaces` schema and ordered migration so permanent organizations keep
  their existing lifecycle model.
- Made organization discovery and authorization expiry-aware while retaining expired database rows
  for later cleanup and evidence work.
- Added Miniflare/D1 coverage for atomic persistence, repeated and concurrent idempotency, changed
  input, required keys, per-user key scope, cross-user read/mutation denial, and expired access.
- Recorded the demo provisioning and lifecycle boundary in ADR-0012.
- Verified `pnpm check` and `pnpm build` across all workspaces.

### MP-0207 and Phase 2 complete

- Added one fail-fast `pnpm verify:phase-02` command covering real local D1 migrations and integrity,
  strict auth contracts, the shared RBAC policy, and Gateway security integration behavior.
- Verified migration reproducibility, all 14 Phase 2 tables, four integrity triggers, final-owner
  enforcement, and rejection of audit event updates and deletes.
- Verified session lifecycle and fixation resistance, passkey proof boundaries, explicit role
  allow/deny behavior, non-enumerating BOLA responses, credentialed CORS and CSRF enforcement,
  durable rate limiting, and isolated idempotent demo provisioning.
- Passed 91 focused Phase 2 Vitest cases plus the D1 integrity probes against local Worker and D1
  runtimes.
- Refreshed ADR-0007 through ADR-0012 and recorded the reproducible exit evidence in
  `docs/verification/phase-02.md`.
- Verified `pnpm check` and `pnpm build` across all workspaces.

Verification record: `docs/verification/phase-02.md`.

## Phase 3 activity

### MP-0301 complete

- Added a separate SignalWorks D1 schema and ordered migration for its stable merchant identity and
  purpose-isolated signing keys.
- Added distinct manifest, catalog, checkout, and event ES256 keys with activation, retirement,
  overlap, and immutable revocation metadata.
- Wrapped private JWKs with A256GCM using merchant/key/purpose authenticated context and exposed only
  strictly validated public JWK records.
- Added lifecycle-aware signing, planned rotation overlap, idempotent revocation, and fail-closed
  denial for revoked, retired, unknown, or incorrectly wrapped keys.
- Added an idempotent `seed:local` command that applies migrations through Wrangler, reuses the same
  persistent local D1 bindings as development, and validates the stored wrapping secret.
- Verified two real local seed executions returned the same merchant creation time and exact public
  keys without exposing private or encrypted material.
- Added 11 SignalWorks tests covering schema declarations, sequential and concurrent reseeding,
  purpose-specific signature verification, wrong-secret rejection, D1 constraint attacks, planned
  rotation, revocation, and conflicting identity denial.
- Recorded the separate merchant signing boundary in ADR-0013.
- Verified `pnpm check` and `pnpm build` across all workspaces.

### MP-0302 complete

- Added a strict `{ manifest, signature }` publication contract and draft 2020-12 JSON Schema; the
  detached ES256 signature covers only the canonical manifest payload and must use the same `kid`.
- Added a reusable MindPay verifier that binds the body to the exact requested and final well-known
  URL, rejects redirects and unexpected status, and validates domain, audience, issuance, expiry,
  public-key lifecycle, and canonical signature in one fail-closed result.
- Published `GET /.well-known/mindpay.json` with the exact SignalWorks origin, root ACP base,
  catalog and MCP endpoints, `razorpay:test`, 24-hour maximum expiry, and all four public
  purpose-isolated signing keys.
- Clamped manifest expiry to any earlier key retirement or revocation boundary and marked each
  nonce-specific response `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.
- Added 6 contract tests proving valid canonical verification and rejection of redirects, final-URL
  changes, coherent domain substitution, expiry, and a one-byte payload mutation.
- Added 2 Miniflare/D1 integration tests proving the Worker signs with its persisted encrypted
  manifest key, exposes no private JWK material, publishes exact metadata, and never redirects
  similar paths to the trust endpoint.
- Recorded the signed publication boundary in ADR-0014.
- Verified `pnpm check` and `pnpm build` across all workspaces.

### MP-0303 complete

- Added immutable `merchant_service_versions` D1 persistence keyed by merchant, stable service ID,
  and semantic version, with typed columns for integer INR price, fulfilment, policy, availability,
  and publication metadata.
- Added D1 triggers rejecting every update and delete plus conflicting insert, upsert, or
  `INSERT OR REPLACE` attempt while allowing exact idempotent seed conflicts.
- Seeded fixed version `1.0.0` records for Market Snapshot at `29900`, Detailed Competitor Dossier
  at `44900`, and Enterprise Intelligence Pack at `79900` INR subunits with stable fulfilment tool
  bindings and publication timestamps.
- Added a strict `{ catalog, signature }` contract and JSON Schema, then published
  `GET /catalog/feed.json` with a fresh nonce, 24-hour maximum expiry, exact seller and audience,
  and a canonical signature from the catalog-only key.
- Proved the service set remains identical across seed and feed refreshes while issuance, nonce,
  expiry, and signature may refresh independently; a one-byte catalog change fails verification.
- Added 6 SignalWorks schema, D1, and endpoint tests plus 2 shared contract/schema tests for the
  signed catalog envelope.
- Applied the real local migration and ran the local seed twice; both runs returned the same three
  service versions and exact identity/key material.
- Recorded the immutable signed catalog boundary in ADR-0015.
- Verified `pnpm check` and `pnpm build` across all workspaces.

### MP-0304 complete

- Implemented the pinned ACP create, update, get, complete, and cancel endpoints with complete
  authoritative state, integer INR service prices, and no caller-controlled price authority.
- Persisted every ACP state revision, canonical hash, detached checkout-key signature, strict
  merchant checkout, and merchant-checkout signature in the separate SignalWorks D1.
- Enforced compare-and-swap transitions from `ready_for_payment`; completed, canceled, and expired
  sessions return `409` without changing their stored state.
- Returned proof headers without adding forbidden properties to ACP response bodies and proved a
  semantic one-byte mutation fails signature verification.

### MP-0305 complete

- Added hashed, expiring, revocable MindPay Gateway machine credentials and required bearer auth,
  pinned `API-Version`, and `Request-Id` before all ACP access.
- Required `Idempotency-Key` for every mutation, scoped records to credential and endpoint, and
  bound them to canonical request JSON.
- Replayed exact stored status, body, and signature headers for matching requests; changed payloads
  return `409`, and invalid or expired credentials cause zero idempotency or checkout writes.

### MP-0306 complete

- Added an immutable D1 outbox with one signed lifecycle event for every accepted checkout
  mutation; events bind merchant, checkout, order where applicable, exact state hash, issuance,
  expiry, nonce, and event-purpose key ID.
- Added a reusable MindPay verifier for schema, audience, issuer, expected merchant identity,
  lifetime, canonical signature, key lifecycle, and atomic nonce replay claims.
- Proved valid event acceptance, replay/expiry/unknown-key rejection, planned two-key overlap, and
  immediate rejection of revoked event keys.

### MP-0307 complete

- Extended the repeatable local seed with the Gateway machine credential while keeping plaintext
  tokens and private key material out of output.
- Proved two independent fresh merchant databases converge on the same public merchant contract,
  catalog payload, exact three service versions, and credential metadata.
- Added Gateway-to-merchant integration coverage for every ACP operation without Razorpay
  credentials and a fail-fast `pnpm verify:phase-03` exit suite.
- Recorded the signed ACP, idempotency, and event-outbox boundary in ADR-0016 and the reproducible
  exit evidence in `docs/verification/phase-03.md`.
- Verified `pnpm verify:phase-03`, `pnpm check`, and `pnpm build` across all workspaces.

## Phase 4 activity

### MP-0401 complete

- Added organization-scoped merchant submission, verification, reverification, and suspension APIs
  with dedicated submit/review capabilities.
- Bound every mutation to a canonical request hash and idempotency key, then committed state,
  append-only admin evidence, cache generation, and the exact stored response atomically.
- Added revision and current-event compare-and-swap enforcement so concurrent reviewer actions
  cannot both commit.

### MP-0402 complete

- Added a fail-closed verifier for public DNS destinations, exact HTTPS URLs, redirects, strict
  manifests/catalogs, audience/domain/merchant binding, key lifecycle, signatures, expiry, stable
  service IDs, immutable versions, integer INR prices, fulfilment bindings, and `razorpay:test`.
- Added stable check-specific failure reasons and immutable D1 evidence for every verification run.
- Added shared signed-catalog verification contracts and adversarial redirect, expiry, merchant,
  mutation, and private-network tests.

### MP-0403 complete

- Added an explicit verification transition table covering all required approval stages.
- Safe signed catalog versions remain approved; key, domain, endpoint, payment, downgrade, and
  same-version-content changes require review; invalid signatures quarantine immediately.
- Reviewer approval can recover reviewed or quarantined merchants only after all checks pass again.

### MP-0404 complete

- Added immutable verified manifest, catalog, key, service, and service-version persistence in D1.
- Added a KV public index whose documents are accepted only when their generation matches D1 and
  their earliest verification boundary remains unexpired.
- Proved a stale approved KV document cannot restore reviewed, quarantined, suspended, or expired
  services.

### MP-0405 complete

- Added public typed service search, service detail, and merchant trust endpoints.
- Added strict filters, bounded prices and limits, deterministic ordering, opaque cursor pagination,
  and non-secret tier, rail, protocol, fulfilment, check-time, and verification-time details.

### MP-0406 and Phase 4 complete

- Added a single lifecycle integration proving submission exclusion, signed approval, discovery,
  safe catalog re-indexing, material-key review, signature quarantine, stale-cache rejection,
  reviewer recovery, evidence expiry, suspension, idempotent replay, and role denial.
- Added the `pnpm verify:phase-04` exit suite, ADR-0017, and the reproducible Phase 4 verification
  record.
- Verified `pnpm verify:phase-04`, `pnpm check`, `pnpm build`, and `git diff --check`.

### Phase 0–4 audit complete

- Reconciled every completed backlog item with the master implementation plan and reran the focused
  Phase 2, Phase 3, and Phase 4 exit suites.
- Bound signed order events to the expected merchant, separated ACP transaction protocol from
  fulfilment transport, and limited trust details to the latest immutable verification run.
- Bounded merchant publication reads by time and size, restored Drizzle journal/snapshot parity for
  the reviewed manual Phase 4 migration, and added a migration-metadata drift guard.

Verification record: `docs/verification/phase-04.md`.

## Blockers

None. Razorpay and other third-party credentials are not required until later phases.
