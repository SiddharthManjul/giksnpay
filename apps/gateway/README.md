# MindPay Gateway

The Gateway is the Cloudflare Worker boundary for authenticated MindPay APIs. Better Auth is
mounted at `/api/auth/*`, stores its core identity and session records in D1 through Drizzle, and
uses an HttpOnly cookie as the only browser session credential.

## Local authentication setup

Apply the checked-in D1 migrations before starting the Worker:

```sh
pnpm --filter @mindpay/db migrations:apply
```

Copy `apps/gateway/.dev.vars.example` to an ignored `apps/gateway/.dev.vars` file and replace the
secret placeholders. The authentication secret must contain at least 32 characters. The agent-key
secret must be exactly 32 random bytes encoded as unpadded base64url; it is an independent wrapping
key. The Google Gemini key is required only for live AI runs. MindPay's default model is the stable
Gemini 3.8 Flash endpoint (`gemini-3.8-flash`):

```dotenv
BETTER_AUTH_SECRET=<generate-a-unique-high-entropy-value>
AGENT_KEY_ENCRYPTION_KEY=<generate-32-random-bytes-as-unpadded-base64url>
GOOGLE_GENERATIVE_AI_API_KEY=<paste-the-key-created-in-google-ai-studio>
```

Then run the Gateway:

```sh
pnpm --filter @mindpay/gateway dev
```

`BETTER_AUTH_URL`, `TRUSTED_ORIGINS`, and `PASSKEY_RP_ID` are non-secret local defaults in
`wrangler.jsonc`. The local configuration has `workers_dev` disabled so it cannot be accidentally
published. Never add secrets to tracked Wrangler variables or application source; provision them as
Worker secrets instead:

```sh
pnpm --filter @mindpay/gateway exec wrangler secret put BETTER_AUTH_SECRET
pnpm --filter @mindpay/gateway exec wrangler secret put AGENT_KEY_ENCRYPTION_KEY
pnpm --filter @mindpay/gateway exec wrangler secret put GOOGLE_GENERATIVE_AI_API_KEY
```

Production uses the separate `wrangler.production.jsonc` and a fail-closed deployment preflight.
Supply the final public origins and their shared passkey DNS suffix before deployment:

```sh
export MINDPAY_GATEWAY_ORIGIN=https://mindpay-gateway.your-account.workers.dev
export MINDPAY_WEB_ORIGIN=https://mindpay-web.your-account.workers.dev
export MINDPAY_PASSKEY_RP_ID=your-account.workers.dev
pnpm --filter @mindpay/gateway deploy
```

The deploy command refuses HTTP, localhost, reserved test domains, URL credentials or paths, and
origins outside the passkey RP ID. Production runtime validation repeats those checks and always
forces Secure session cookies.

The Google Gemini API origin is fixed by the provider SDK and cannot be overridden through runtime
configuration. To try another Gemini model later, keep the same
`GOOGLE_GENERATIVE_AI_API_KEY` and replace only `AGENT_MODEL_NAME` with an exact supported model ID.

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

## Agent administration

Agent reads require `agent:read`; creation, draft-version creation, and publication require
`agent:write`. Every route is constrained by the selected organization header:

```text
GET  /api/v1/agents
POST /api/v1/agents
GET  /api/v1/agents/:agentId
POST /api/v1/agents/:agentId/versions
POST /api/v1/agents/:agentId/publish
```

Every mutation requires `Idempotency-Key`. Agent creation generates one ES256 signing identity.
Only its public JWK reaches API responses; the private JWK is immediately A256GCM-wrapped with the
agent ID and key ID as authenticated context. Published versions and their tool bindings are locked
by D1 triggers, including against direct database writes. The registry accepts only the six
reviewed tool versions; arbitrary URL, shell, raw-database, policy-mutation, and payment execution
are not runtime capabilities.

## Agent runs and manual fallback

Agent execution and its evidence use the selected organization and the same `agent:read` or
`agent:write` capabilities:

```text
POST /api/v1/agents/:agentId/runs
POST /api/v1/agent-runs
POST /api/v1/agent-runs/manual
GET  /api/v1/agent-runs/:runId
GET  /api/v1/agent-runs/:runId/events
```

Every run mutation requires `Idempotency-Key`. An exact retry returns the stored run without
re-invoking the model or tools; reusing the key with different input returns 409. The nested route
is canonical, while `/api/v1/agent-runs` accepts the same AI request with `agentId` in the body.

The AI route parses a bounded intent, searches only current verified services, retrieves canonical
service and signed-catalog evidence, applies every immutable tool scope, and builds a server-owned
proposal. Merchant and model prose are untrusted and cannot select a payee, amount, tool, or state
transition. Tool inputs and outputs, canonical hashes, latency, explicit terminal status, summaries,
and the event sequence are persisted; hidden model reasoning is not part of the runtime or evidence
contracts.

AI execution has a server-owned 45-second deadline shared by parsing and explanation, a hard 2,048
token output ceiling, one concurrent model run per organization, and atomic per-user and
per-organization minute budgets in D1. A user also cannot bypass concurrency by switching
organizations. Capacity exhaustion returns `429` with `Retry-After: 60`
before invoking the provider. Capacity leases expire automatically and are also released when a run
finishes or fails. Model capacity uses dedicated D1 tables rather than Better Auth's rate-limit
storage, so authentication cleanup cannot weaken an active AI limit.

The event endpoint is one-shot reconnectable SSE. Resume with `Last-Event-ID` or the equivalent
`after` query value, process the remaining events, then honor the final `refetch` event by reading
the canonical run. When the configured model provider is unavailable, the AI run closes with
`PROVIDER_UNAVAILABLE`; public marketplace reads and manual selection remain usable. The manual
route invokes the same scoped service lookup, signed offer, deterministic proposal, and evidence
path without invoking a model.

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

Run the complete agent-runtime and fallback exit suite with:

```sh
pnpm verify:phase-05
```

## Reserved payments and merchant evidence

`POST /api/v1/transactions/:transactionId/checkout` creates a merchant payment order only while a
live spend reservation and closed payment authority exist. A failed attempt releases that
reservation; `POST /api/v1/transactions/:transactionId/retry` creates a new reservation only below
the mandate attempt limit, after which checkout creates a distinct provider order.

SignalWorks posts replay-protected signed results to
`POST /api/internal/v1/merchant-payment-events` with the shared machine token. Gateway verifies the
merchant event key, issuer, audience, expiry, nonce, tenant, transaction, attempt, and provider
references. It commits budget and enters `PAYMENT_CAPTURED` only for exact paid-plus-captured
evidence with an active reservation. Razorpay secrets never enter Gateway configuration.

Run the complete deterministic payment boundary with:

```sh
pnpm verify:phase-07
```
