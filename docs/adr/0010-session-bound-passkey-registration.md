# ADR-0010: Session-bound passkey registration

- Status: Accepted
- Date: 2026-08-29
- Owners: MindPay engineering

## Context

MindPay needs WebAuthn public credentials that can later verify mandate activation and transaction
step-up proofs. Registration is a two-request ceremony: the server creates a challenge and the
browser returns an authenticator attestation. A challenge that is reusable, accepted from another
session, or verified for a different origin would weaken the proof before mandate signing begins.

Better Auth's passkey plugin uses SimpleWebAuthn and consumes an expiring verification row selected
by a signed challenge cookie. Its session-required registration flow binds the stored challenge to
the user, but not to the exact session identifier required by MindPay's acceptance criteria.

## Decision

Use `@simplewebauthn/server` 13.3.1 directly at the Gateway boundary. Keep Better Auth as the
account and session authority, and require its live database session for every passkey route.

`POST /api/v1/passkeys/registration/options` generates a random WebAuthn user handle and registration
challenge with five-minute expiry. Registration requires a resident credential and authenticator
user verification. The D1 challenge row stores:

- a SHA-256 hash of the challenge, never the raw challenge;
- the exact Better Auth session ID and user ID;
- the canonical browser origin and configured RP ID;
- the opaque WebAuthn user handle; and
- creation, expiry, and optional consumption timestamps.

The options endpoint accepts only an exact trusted origin whose hostname is the RP ID or one of its
subdomains. Preview and production origins remain HTTPS-only. `PASSKEY_RP_ID` is explicit runtime
configuration so an API subdomain does not accidentally become the browser credential scope.

`POST /api/v1/passkeys/registration/verify` atomically sets `consumed_at` only when challenge ID,
session ID, user ID, origin, RP ID, pending state, and expiry all match. It performs that conditional
update before WebAuthn verification, so every verification attempt is single use, including a
malformed or invalid attestation. SimpleWebAuthn then verifies the challenge hash, exact origin, RP
ID, user presence, and user verification.

Persist only credential ID, COSE public-key bytes encoded as unpadded base64url, opaque WebAuthn user
handle, counter, device type, backup state, transports, AAGUID, label, ownership, and timestamps.
There is no private-key column because private material remains inside the user's authenticator.
Credential IDs are globally unique.

Expose authenticated list, rename, and delete routes. Their responses contain only the MindPay
credential ID, display label, device/backup metadata, transports, and creation time. They never
return the authenticator credential ID, public key, WebAuthn user handle, or counter. Every mutation
is constrained by both passkey ID and authenticated user ID; another user's credential is reported
as not found.

## Consequences

- A failed verification burns its challenge. The user must request fresh options instead of
  retrying a ceremony whose response may already have been replayed.
- Signing in again creates another session that cannot finish a ceremony started by the first
  session, even for the same user.
- The registration challenge is sent ephemerally to the browser because WebAuthn requires it, but
  it is not stored raw, logged, placed in browser persistence, or returned by management APIs.
- Credential storage is ready for later authentication and mandate-proof verification, but those
  challenge purposes and counter updates remain separate tickets.
- ADR-0011 enforces credentialed CORS and CSRF checks before every passkey route and applies the
  durable authentication abuse boundary used by the surrounding account lifecycle.

## Alternatives considered

- Using the Better Auth passkey plugin unchanged was rejected because its stored registration value
  is user-bound rather than explicitly bound to the exact Better Auth session ID.
- Storing the raw challenge was rejected because verification supports a challenge predicate and a
  hash is sufficient to authenticate the returned value.
- Consuming the challenge after successful verification was rejected because concurrent or repeated
  invalid attempts could race through the same pending ceremony.
- Storing credential public keys as D1 BLOB values was rejected because the current Drizzle SQLite
  buffer mapper depends on Node `Buffer`; canonical base64url text is Worker-native and reversible.

## Verification

- `pnpm verify:phase-02`
- `pnpm --filter @mindpay/config test`
- `pnpm --filter @mindpay/contracts test`
- `pnpm --filter @mindpay/db test`
- `pnpm --filter @mindpay/gateway test`
- `pnpm check`
- `pnpm build`
