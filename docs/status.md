# MindPay implementation status

Last updated: 2026-08-29

## Current phase

Phase 0 is complete. Phase 1 is in progress with 6 of 7 tickets complete. The next ticket is MP-0107,
the pinned ACP 2026-04-17 snapshot and conformance boundary.

## Phase progress

| Phase | Status | Exit gate |
|---|---|---|
| 0. Repository and guardrails | Complete | All workspaces build; format, lint, typecheck, and tests pass |
| 1. Contracts, crypto, and protocols | In progress | Schema and cryptographic conformance tests pass |
| 2. Database, auth, and tenancy | Not started | Auth, roles, passkeys, and audit immutability pass |
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

## Blockers

None. Credentials are not required until later phases.
