# ADR-0014: Signed manifest publication boundary

- Status: Accepted
- Date: 2026-08-30
- Owners: MindPay engineering

## Context

SignalWorks must publish its merchant identity, endpoints, payment rail, signing-key metadata, and
expiry at `/.well-known/mindpay.json`. The manifest is an unauthenticated network response, so
schema validity alone cannot establish which merchant produced it. Conversely, accepting a valid
signature without binding the response to the requested URL would permit redirects or a different
origin to substitute a valid document.

The signing layer already defines a detached canonical ES256 signature over
`{ alg, kid, payload }`. The public HTTP representation still needs an explicit envelope and one
verification decision that combines transport metadata, contract validation, time, key lifecycle,
and cryptographic authenticity.

## Decision

Publish a strict version 1 response envelope with exactly two fields: `manifest` contains the
canonical merchant manifest and `signature` contains `alg`, `kid`, and the 64-byte unpadded
base64url ES256 signature. The signature covers only the manifest payload through the shared
canonical JSON signing primitive. The envelope requires the signature `kid` to equal the
manifest's selected manifest-signing `kid`.

SignalWorks creates a fresh manifest on each request with a canonical nonce, millisecond UTC
issuance, and a maximum 24-hour lifetime. Expiry is shortened to the selected key's retirement or
revocation boundary when either occurs sooner. The response uses `Cache-Control: no-store` because
the nonce, lifetime, and signature are request-specific. It publishes all public purpose keys and
never private or encrypted JWK material.

The manifest identifies `https://merchant-demo.example.com` as its exact origin, uses the root
origin as its ACP base because checkout routes live at `/checkout_sessions`, and pins catalog and
MCP endpoints to the same origin. The only advertised payment rail is `razorpay:test`, and the
intended verifier audience is `https://api.mindpay.example/`.

Add a reusable MindPay contract verifier that accepts the response body plus requested URL, final
response URL, status, and `Location` metadata. It rejects a non-canonical discovery URL, any
redirect signal or final-URL change, non-200 status, malformed envelope, domain or audience
mismatch, future or expired manifest, invalid public key, inactive or revoked key, and invalid
signature. Network resolution and private-address defenses remain part of the Phase 4 fetch
boundary; this verifier assumes the caller has already obtained the response metadata without
following redirects.

## Consequences

- A syntactically valid manifest is not trusted until transport, origin, lifetime, key, and
  signature checks all succeed.
- A one-byte manifest mutation invalidates the detached signature.
- A valid document served through a redirect or from a different final URL is rejected.
- Manifest validity never extends past the selected signing key's usable lifetime.
- The signed response is deliberately not cacheable; Phase 4 may persist only a successfully
  verified canonical snapshot and its verification evidence.
- Catalog, checkout, and event keys remain visible as public verification metadata but cannot sign
  the manifest.

## Alternatives considered

- Embedding `signature` directly in the manifest was rejected because it creates ambiguity about
  whether the signature field signs itself.
- Signing arbitrary response bytes was rejected because equivalent JSON serialization would no
  longer verify consistently across runtimes.
- Following same-origin redirects was rejected because the trust document must be anchored to one
  exact well-known URL with no redirect-dependent interpretation.
- Giving the manifest a fixed long lifetime was rejected because key rotations and emergency
  revocations would leave stale trust metadata usable for too long.
- Returning only the selected manifest key was rejected because consumers need public metadata for
  the catalog, checkout, and event signatures advertised by the same merchant identity.

## Verification

- `pnpm --filter @mindpay/contracts test`
- `pnpm --filter @mindpay/merchant-signalworks test`
- `pnpm --filter @mindpay/contracts typecheck`
- `pnpm --filter @mindpay/merchant-signalworks typecheck`
- `pnpm check`
- `pnpm build`
