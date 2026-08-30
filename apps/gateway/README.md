# MindPay Gateway

The Gateway is the Cloudflare Worker boundary for authenticated MindPay APIs. Better Auth is
mounted at `/api/auth/*`, stores its core identity and session records in D1 through Drizzle, and
uses an HttpOnly cookie as the only browser session credential.

## Local authentication setup

Apply the checked-in D1 migrations before starting the Worker:

```sh
pnpm --filter @mindpay/db migrations:apply
```

Create an ignored `apps/gateway/.dev.vars` file containing a unique, high-entropy secret of at
least 32 characters:

```dotenv
BETTER_AUTH_SECRET=<generate-a-unique-high-entropy-value>
```

Then run the Gateway:

```sh
pnpm --filter @mindpay/gateway dev
```

`BETTER_AUTH_URL`, `TRUSTED_ORIGINS`, and `PASSKEY_RP_ID` are non-secret local defaults in
`wrangler.jsonc`. The RP ID must equal or be a parent domain of every trusted browser origin.
Preview and production deployments must replace the origins with HTTPS values. Never add
`BETTER_AUTH_SECRET` to tracked Wrangler variables or application source; provision it as a Worker
secret instead:

```sh
pnpm --filter @mindpay/gateway exec wrangler secret put BETTER_AUTH_SECRET
```

## Session boundary

- Better Auth logging and telemetry are disabled.
- Sessions remain database-backed and cookie caching is disabled so revocation takes effect on the
  next request.
- Auth JSON responses are recursively stripped of session and OAuth token properties before they
  leave the Gateway. Browser clients authenticate only with the HttpOnly cookie.
- Better Auth CSRF and origin validation remain enabled behind the shared Gateway browser boundary.
- Browser requests must use an exact trusted origin. Cookie-authenticated mutations without one,
  cross-site unsafe requests, untrusted origins, and invalid preflights fail before route handling.
- Credentialed CORS never uses a wildcard and accepts only the documented API methods,
  `Content-Type`, `Idempotency-Key`, and `x-mindpay-organization-id`.
- Authentication rate limits use atomic D1 counters. Cloudflare's `CF-Connecting-IP` is the only
  trusted client address header; `X-Forwarded-For` is ignored.

Run the isolated D1 lifecycle test with:

```sh
pnpm --filter @mindpay/gateway test
```

## Organization context

Authenticated product routes under `/api/v1` use the Better Auth session cookie. Organization-owned
routes also require the selected organization on every request:

```http
x-mindpay-organization-id: org_01JGFJH900H8M2APVYVDZ4R6AA
```

Call `GET /api/v1/me` to list the session user's active organizations and exact capabilities, then
send the selected ID to the current-organization routes. Organization and member queries are always
constrained by both that ID and the authenticated user. Inaccessible and nonexistent objects return
the same resource-not-found response.

## Demo workspaces

Launch an isolated 24-hour workspace with an authenticated session:

```http
POST /api/v1/demo-workspaces
Idempotency-Key: demo-launch-01JGFJH900H8M2APVYVDZ4R6AA
Content-Type: application/json

{"name":"Judge Demo"}
```

The body is optional. Provisioning creates an organization and OWNER membership and returns its
canonical creation and expiry timestamps. Repeating the same key and normalized request returns the
stored workspace, including during concurrent retries. Changing the request while reusing the key
returns 409. Keys are scoped per authenticated user, and expired demos disappear from `/api/v1/me`
and all current-organization authorization checks.

## Passkeys

Passkey registration uses the live Better Auth session and the request's exact trusted origin:

```text
POST   /api/v1/passkeys/registration/options
POST   /api/v1/passkeys/registration/verify
GET    /api/v1/passkeys
PATCH  /api/v1/passkeys/:passkeyId
DELETE /api/v1/passkeys/:passkeyId
```

Challenges expire after five minutes, are stored only as SHA-256 hashes, bind to the exact session,
user, origin, and RP ID, and are atomically consumed before attestation verification. Failed
verification requires new options. Credential management responses expose only display metadata;
authenticator credential IDs, public keys, user handles, and counters remain server-side.

## Merchant verification administration

Merchant mutations require the selected organization, an authenticated capability, and a unique
idempotency key:

```text
POST /api/v1/admin/merchants
POST /api/v1/admin/merchants/:merchantId/verify
POST /api/v1/admin/merchants/:merchantId/reverify
POST /api/v1/admin/merchants/:merchantId/suspend
```

BUILDER may submit; REVIEWER may verify, reverify, and suspend; OWNER and ADMIN have both
capabilities. Every accepted mutation is request-hash bound and append-only audited. Verification
resolves only public destinations, rejects redirects, binds exact HTTPS origins, validates strict
signed manifest and catalog contracts, and stores stable failure reasons. Safe catalog versions
re-index. Material key, domain, endpoint, payment, downgrade, or same-version-content changes enter
`REVIEW_REQUIRED`; signature failure enters `QUARANTINED`.

## Public marketplace

These endpoints are public and derive only from active, approved, unexpired D1 state:

```text
GET /api/v1/marketplace/services
GET /api/v1/marketplace/services/:serviceId
GET /api/v1/marketplace/merchants/:merchantId
```

Search supports `q`, `category`, `merchantId`, `availability`, `fulfilment`, integer
`minPriceSubunits`/`maxPriceSubunits`, bounded `limit`, and the returned opaque `cursor`. Results are
deterministically ordered. KV accelerates the public service document but is never authoritative:
its D1 generation must match and its verification expiry must remain in the future. If either check
fails, Gateway rebuilds from canonical D1 before responding.

Run the focused marketplace exit suite with:

```sh
pnpm verify:phase-04
```
