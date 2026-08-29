# Phase 1 verification

- Date: 2026-08-29
- Result: Pass
- Credentials required: None

## Contract boundaries verified

| Boundary | Evidence |
|---|---|
| Domain primitives | Safe integer INR money, canonical UTC timestamps, ULIDs, request IDs, and idempotency keys |
| Canonical data | RFC 8785-compatible deterministic JSON with adversarial input rejection |
| Hashing and MAC | SHA-256 and HMAC-SHA256 official vectors, mutations, and unequal-length rejection |
| Signing and key storage | ES256 rotation/revocation and A256GCM context-bound private-JWK encryption |
| Merchant contracts | Strict manifest, catalog, service, offer, and checkout schemas plus SignalWorks fixtures |
| Cross-party proofs | AP2-aligned mandates, merchant events, audit chains, entitlements, and evidence graphs |
| ACP `2026-04-17` | Immutable vendor pin, 33 SHA-256-checked artifacts, generated types, and conformance fixtures |

## ACP verification detail

- Source repository pin: `7fdd78df677a94dce04c770644b0fbbb1401272b`.
- Original dated release commit: `9abf303f48088d170503a54502d612b8b1997897`.
- Last upstream modification to the released spec path before the pin:
  `17adf494cf8b4bcb41967a0386188b8103316d2f`.
- Seven JSON Schema bundles generate strict TypeScript contracts and embedded runtime schemas.
- Fifty-nine representative official examples pass exact draft 2020-12 validation.
- Eight byte-preserved historical upstream examples are recorded as known schema mismatches and
  fail validation without weakening the pinned boundary.
- Missing required fields, unknown fields, wrong primitive types, and failed assertions are rejected.

## Verified commands

| Command | Result | Proves |
|---|---|---|
| `shasum -a 256 -c protocol/acp/2026-04-17/CHECKSUMS.sha256` | Pass | Every official vendored ACP artifact matches its recorded digest |
| `pnpm --filter @mindpay/protocol-acp generate:check` | Pass | Generated contracts match all seven pinned JSON Schemas |
| `pnpm --filter @mindpay/protocol-acp test` | Pass | ACP provenance, conformance, and negative fixtures pass |
| `pnpm check` | Pass | Formatting, lint, strict typecheck, and all unit/property/contract tests pass |
| `pnpm build` | Pass | All application and package production builds pass |

## Result

The Phase 1 exit gate is satisfied: malformed fixtures fail, one-byte signature mutations fail,
canonical JSON matches its golden vectors, and the pinned ACP conformance fixtures pass. Phase 2
may build database, authentication, and tenancy behavior on these frozen boundaries.
