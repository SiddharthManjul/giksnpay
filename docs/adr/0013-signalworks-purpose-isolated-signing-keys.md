# ADR-0013: SignalWorks purpose-isolated signing keys

- Status: Accepted
- Date: 2026-08-30
- Owners: MindPay engineering

## Context

SignalWorks is a separately deployed merchant and must not share MindPay's buyer identity database
or platform signing authority. Its manifest, catalog, checkout, and reconciliation events cross
different trust boundaries. Reusing one signing key for every object would let compromise of one
purpose impersonate all of them and would make independent rotation impossible.

The local merchant seed must be safe to rerun. It needs stable public identity and keys after the
first execution, while private signing material must never be committed, printed, returned from an
API, or stored as plaintext in D1.

## Decision

Give the SignalWorks Worker a separate D1 database with `merchant_identity` and
`merchant_signing_keys` tables. The stable identity is `merchant_signalworks` at
`merchant-demo.example.com`. Seed exactly one initial ES256 key for each of four purposes:
`manifest`, `catalog`, `checkout`, and `event`.

Store each public P-256 JWK with one purpose, a canonical `kid`, `valid_from`, optional
`valid_until`, and optional immutable `revoked_at`. D1 checks reject unknown purposes, private `d`
material in public JWKs, malformed encryption envelopes, inverted validity windows, and revocation
before activation.

Generate extractable key pairs only inside the seed or rotation operation. Immediately wrap the
private JWK with A256GCM using the `SIGNALWORKS_KEY_ENCRYPTION_KEY` Worker secret and authenticated
context containing the merchant ID, `kid`, and purpose. Persist only the encrypted envelope. The
public identity reader validates every D1 row through strict schemas and omits encrypted material.

The local seed applies migrations through Wrangler and opens the same persistent local bindings
used by `wrangler dev`. It inserts the identity and any missing initial keys with conflict-safe D1
statements, then proves every stored private JWK decrypts with the supplied wrapping secret.
Sequential and concurrent reruns converge on the stored identity rather than replacing key
material.

Signing loads an exact purpose key, decrypts it only in the Worker, imports it as a non-extractable
CryptoKey, and applies the shared ES256 lifecycle checks. Rotation atomically schedules the old
key's retirement and inserts a new purpose-equivalent key with an explicit overlap. Revocation is
idempotent for the same timestamp and a revoked key cannot create new signatures.

## Consequences

- SignalWorks and MindPay have separate databases, secrets, and signing authority.
- Compromise of a catalog key does not grant checkout or event signing authority.
- The first seed creates random keys; subsequent runs preserve the same stored merchant identity
  and public JWKs.
- Losing or changing the wrapping secret makes private keys unrecoverable and reseeding fails
  closed instead of silently replacing them.
- Planned rotations can publish old and new public keys during an explicit overlap window, while
  revoked or retired keys remain available only as verification history.
- MP-0302 and MP-0303 can publish the purpose-specific public keys without gaining access to private
  JWK material.

## Alternatives considered

- One key with four purposes was rejected because it expands compromise scope and couples all
  rotations.
- Deterministic key generation from a committed seed was rejected because the seed would itself be
  reusable private signing authority.
- Plaintext private JWK columns were rejected because D1 snapshots and operational access would
  reveal merchant signing authority.
- Recreating keys on every seed was rejected because public identity and signatures would become
  unstable and existing verification records would break.
- Keeping keys only in source-level fixtures was rejected because fixtures are public test data,
  not runtime signing authority.

## Verification

- `pnpm --filter @mindpay/merchant-signalworks seed:local` run twice against persistent local D1
- `pnpm --filter @mindpay/merchant-signalworks test`
- `pnpm --filter @mindpay/merchant-signalworks typecheck`
- `pnpm check`
- `pnpm build`
