# SignalWorks merchant Worker

SignalWorks is a separately deployed reference merchant with its own Worker and D1 database. Its
stable identity is `merchant_signalworks`. Manifest, catalog, checkout, and event signing use four
different ES256 keys so compromise or rotation of one purpose does not grant another purpose.

## Local secrets

Private signing JWKs are encrypted in D1 with A256GCM. Generate a canonical 32-byte local wrapping
secret:

```bash
openssl rand -base64 32 | tr '+/' '-_' | tr -d '='
```

Copy `.dev.vars.example` to `.dev.vars` and replace its placeholder with that output. The file is
ignored by Git. Keep the same value for the life of the local database: the seed command verifies
that every stored private key can still be decrypted and fails closed when the wrapping secret is
wrong.

Production and preview values must be provisioned as the
`SIGNALWORKS_KEY_ENCRYPTION_KEY` Worker secret. They must never be stored in `wrangler.jsonc`, source
control, logs, public manifests, or browser responses.

Also generate a separate high-entropy `SIGNALWORKS_MACHINE_AUTH_TOKEN` with at least 32 printable
ASCII characters. The seed stores only its SHA-256 digest in D1. MindPay Gateway supplies the
plaintext as a bearer token; it is never returned or written to checkout, event, or idempotency
records.

## Local seed

From the repository root:

```bash
pnpm --filter @mindpay/merchant-signalworks seed:local
```

The command applies ordered migrations to Wrangler's persistent local SignalWorks D1 database,
inserts the stable merchant if missing, generates any missing initial purpose keys, and seeds the
three immutable service versions and the Gateway machine credential. Repeating the command returns
the same creation timestamp, public JWKs, service IDs, versions, prices, fulfilment bindings,
publication timestamps, and public credential metadata. Its output is intentionally public only;
tokens and encrypted private-key envelopes are never printed.

## Verification

```bash
pnpm --filter @mindpay/merchant-signalworks test
pnpm --filter @mindpay/merchant-signalworks typecheck
pnpm --filter @mindpay/merchant-signalworks build
```

The integration suite runs the migration against Miniflare D1 and verifies sequential and
concurrent seed idempotency, purpose isolation, public-key-only responses, encrypted private-key
storage, wrong-secret rejection, planned rotation overlap, revocation, and database constraints.

## Signed well-known manifest

After seeding, the Worker serves `GET /.well-known/mindpay.json`. The response is a strict
`{ manifest, signature }` envelope. Its detached ES256 signature covers the canonical manifest and
uses the active manifest-purpose key stored in D1. The manifest expires within 24 hours, or sooner
when that key retires or is revoked, and advertises only public JWKs.

The endpoint is anchored to
`https://merchant-demo.example.com/.well-known/mindpay.json`; it advertises the root origin as the
ACP base plus exact-origin catalog and MCP endpoints. Responses use `Cache-Control: no-store` and
do not redirect. MindPay's shared contract verifier rejects final-URL changes, domain or audience
mismatch, future or expired manifests, inactive keys, malformed signatures, and payload mutation.

## Signed service catalog

`GET /catalog/feed.json` returns a strict `{ catalog, signature }` envelope signed only by the
catalog-purpose key. Catalog version `1.0.0` contains three immutable services:

- Market Snapshot: ₹299 (`29900` paise)
- Detailed Competitor Dossier: ₹449 (`44900` paise)
- Enterprise Intelligence Pack: ₹799 (`79900` paise)

Service versions are stored in D1 under `(merchant_id, service_id, version)`. Database triggers
reject updates, deletes, conflicting upserts, and replacement inserts, so changing any published
price, policy, fulfilment binding, or other field requires a new service version and catalog
version. Feed refreshes preserve the service records while using a fresh nonce, issuance, expiry,
and signature.

## ACP checkout API

SignalWorks implements the pinned ACP `2026-04-17` operations:

- `POST /checkout_sessions`
- `POST /checkout_sessions/:checkout_session_id`
- `GET /checkout_sessions/:checkout_session_id`
- `POST /checkout_sessions/:checkout_session_id/complete`
- `POST /checkout_sessions/:checkout_session_id/cancel`

All methods require `Authorization: Bearer ...`, `API-Version: 2026-04-17`, and `Request-Id`.
Mutations also require `Idempotency-Key`. The idempotency key is scoped to the authenticated
credential and exact endpoint and bound to canonical request JSON. Matching retries receive the
stored response; using the key with changed input returns `409`.

ACP bodies remain unmodified and validate against the vendored schema. The response headers
`X-MindPay-ACP-Signature`, `X-MindPay-Checkout`, and `X-MindPay-Checkout-Signature` carry bounded
base64url canonical proofs from the checkout-purpose key. Caller-supplied names and prices never
override the immutable catalog.

Accepted mutations append immutable signed lifecycle events to `merchant_outbound_events`. The
shared verifier checks audience, issuer, timestamp, expiry, nonce replay, state hash, signature,
and event-key lifecycle. Completing the ACP contract creates an order record but does not contact
Razorpay; merchant-owned Test Mode payment starts in Phase 7.

## Razorpay Test Mode payments

SignalWorks owns all Razorpay credentials and the external order lifecycle. Configure only Test
Mode values in `.dev.vars`; never put the key secret or webhook secret in `wrangler.jsonc`, logs,
signed merchant documents, Gateway bindings, or browser responses.

The payment boundary exposes:

```text
POST /payments/orders
POST /payments/callback
POST /webhooks/razorpay
POST /payments/:transactionId/refunds
GET  /payments/:transactionId/provider-status
```

Order creation requires the Gateway bearer token, `Idempotency-Key`, and a closed payment
authorization for a reserved transaction. The callback verifies the stored-order HMAC but remains
non-authoritative. Webhooks are verified over exact raw bytes, retained privately in R2,
deduplicated in D1, and reconciled asynchronously by the configured queue. SignalWorks signs the
result with its event-purpose key for MindPay.

Refunds and the read-only status adapter return not found unless their independent feature flags
are enabled. Neither is required for the purchase path. Run deterministic payment verification
from the repository root with `pnpm verify:phase-07`; the real external Test Mode run additionally
requires credentials and a public/tunnel webhook endpoint.
