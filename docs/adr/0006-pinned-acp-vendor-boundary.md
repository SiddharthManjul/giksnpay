# ADR-0006: Pinned ACP vendor boundary

- Status: Accepted
- Date: 2026-08-29
- Owners: MindPay engineering

## Context

MindPay's merchant checkout implementation depends on the Agentic Commerce Protocol, but a floating
dependency or a moving `main` branch would allow checkout, payment, authentication, feed, and order
contracts to change without a MindPay architecture decision. ACP uses dated releases, yet upstream
has applied official fixes to released directories after their release commit. The `2026-04-17`
artifact set also contains a small number of historical examples that do not validate against the
schemas shipped in the same dated snapshot.

## Decision

Vendor the complete official ACP `2026-04-17` dated artifact set under
`protocol/acp/2026-04-17`. Pin the source repository at immutable commit
`7fdd78df677a94dce04c770644b0fbbb1401272b`, record the original release commit
`9abf303f48088d170503a54502d612b8b1997897`, and record
`17adf494cf8b4bcb41967a0386188b8103316d2f` as the last upstream commit that modified the released
specification path before the pin. Preserve the upstream files byte-for-byte and cover every
official artifact with a SHA-256 manifest.

Treat the seven vendored draft 2020-12 JSON Schema bundles as the only ACP runtime validation
authority. Generate strict TypeScript contracts and embedded schema bundles deterministically from
those files. `@mindpay/protocol-acp` exposes version constants, generated endpoint types, generic
type guards and assertions, normalized validation errors, and cached Ajv validators. Generation
must fail if it emits an explicit `any`, and package tests must fail if generated files are stale.

Conformance tests use only vendored official examples and never fetch network content. Official
examples that validate are positive fixtures. Eight historical upstream examples whose contents
contradict the pinned schemas are preserved unchanged and recorded as known upstream mismatches;
they are not presented as conformant fixtures. MindPay-owned mutations provide the deliberate
negative cases.

Any future ACP upgrade requires a new dated directory, independent provenance and checksums,
regenerated types, a new conformance record, and an ADR that explicitly migrates consumers. No
code may resolve ACP from a floating Git reference, remote schema URL, or `unreleased` directory.

## Consequences

- Merchant and gateway code share one offline, reproducible ACP boundary.
- Upstream changes cannot alter a build unless MindPay deliberately vendors a new snapshot.
- Runtime validation and TypeScript contracts originate from the same checked artifacts.
- The generated source is larger than handwritten DTOs, but its provenance and regeneration are
  mechanical and reviewable.
- The official snapshot's known example/schema contradictions remain visible without weakening the
  validators or editing third-party evidence.
- ACP conformance claims are limited to the pinned schemas and passing fixtures; this does not claim
  certification against a newer protocol release.

## Alternatives considered

- Depending on the upstream repository or an ACP package at runtime was rejected because it permits
  dependency and schema drift.
- Pinning only the original release commit was rejected because it omits upstream's official fixes
  to the dated release path.
- Copying only the checkout schema was rejected because checkout references the broader cart,
  authentication, payment, feed, extension, webhook, order, and MCP contract family.
- Editing incompatible upstream examples was rejected because vendored evidence must remain
  byte-identical to its recorded source.
- Handwriting ACP TypeScript DTOs was rejected because schema and implementation would drift.

## Verification

- SHA-256 tests cover all 33 official vendored artifacts and reject symlinks or unrecorded files.
- Provenance tests bind the version, pin, release, and last-released-path commit.
- Generation checks reproduce seven TypeScript contract modules and the embedded runtime schema
  bundles from the vendored JSON Schemas.
- Fifty-nine representative official HTTP examples validate across checkout, delegated payment,
  delegated authentication, and feed contracts.
- Eight preserved upstream mismatches fail as documented, and MindPay-owned missing-field,
  unknown-field, wrong-type, and assertion cases fail closed.
