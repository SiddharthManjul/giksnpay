# MindPay implementation status

Last updated: 2026-08-29

## Current phase

Phases 0 and 1 are complete. Phase 2 is in progress. The next ticket is MP-0203, organization,
membership, and role authorization.

## Phase progress

| Phase | Status | Exit gate |
|---|---|---|
| 0. Repository and guardrails | Complete | All workspaces build; format, lint, typecheck, and tests pass |
| 1. Contracts, crypto, and protocols | Complete | Schema and cryptographic conformance tests pass |
| 2. Database, auth, and tenancy | In progress | Auth, roles, passkeys, and audit immutability pass |
| 3. SignalWorks merchant | Not started | Signed manifest, catalog, and ACP checkout pass |
| 4. Marketplace and verification | Not started | Only verified services are discoverable |
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

## Blockers

None. Credentials are not required until later phases.
