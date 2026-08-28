# ADR-0003: Signing-key lifecycle and private-key encryption

- Status: Accepted
- Date: 2026-08-28
- Owners: MindPay engineering

## Context

MindPay agents, merchants, and the platform must sign protocol objects without exposing private
material to browsers, models, logs, or public key feeds. Verification must support planned key
overlap while never falling back from an unknown or revoked `kid`. Exported agent private keys must
remain confidential at rest and bound to their owning records.

## Decision

Use Web Crypto ECDSA P-256 with SHA-256 for ES256 operations. Canonical MindPay signatures cover an
RFC 8785 object containing `alg`, `kid`, and `payload`; signatures use Web Crypto's 64-byte IEEE
P1363 representation encoded as unpadded base64url. Raw ES256 helpers remain available for later
standards-specific encodings such as JWS.

Signing and verification keys carry `validFromEpochMs`, optional `validUntilEpochMs`, and optional
`revokedAtEpochMs`. Verification selects the exact `kid`, rejects duplicate configuration, and
returns distinct unknown, not-yet-valid, expired, revoked, or invalid-signature outcomes. A revoked
key cannot create a new signature and cannot verify an older signature after revocation takes
effect.

Encrypt exported ES256 private JWKs with 256-bit AES-GCM. Every encryption receives a fresh
runtime-generated 96-bit IV; callers cannot inject one. The authenticated additional data is a
domain-separated canonical object containing a required ownership context, intended to include the
agent ID and `kid`. The stored envelope contains only version, algorithm, IV, and ciphertext with
its 128-bit authentication tag.

## Consequences

- Public JWK helpers reject private `d` material and non-P-256 keys.
- Planned rotations can keep old and new keys active during an explicit overlap window.
- Unknown key IDs never trigger fallback verification with another key.
- Moving encrypted private material to a different agent or `kid` makes decryption fail.
- The wrapping key must be provisioned as a 32-byte secret outside the database and must never be
  logged or exposed to clients.
- Exportability is opt-in for generated signing and encryption keys.

## Alternatives considered

- Signing payload bytes without `alg` and `kid` was rejected because signature metadata would not
  be cryptographically bound.
- Trying every active public key was rejected because it weakens key identity and rotation audits.
- Caller-supplied AES-GCM IVs were rejected because accidental nonce reuse is catastrophic for GCM.
- Storing plaintext private JWKs or encrypting without associated ownership data was rejected.

## Verification

- P-256 generation, JWK export/import, raw signing, and canonical signing round trips are tested.
- One-byte message and signature mutations, malformed envelopes, unknown keys, inactive keys, and
  revoked keys fail verification.
- Rotation tests accept two active keys during overlap and reject the revoked key afterward.
- The NIST AES-256-GCM vector passes; ciphertext, IV, key, and associated-data mutations fail.
- Decrypted private JWKs retain signing capability only with the correct associated context.
