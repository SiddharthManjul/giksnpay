# ADR-0011: Fail-closed browser boundary and durable auth rate limits

- Status: Accepted
- Date: 2026-08-29
- Owners: MindPay engineering

## Context

Better Auth validates CSRF and trusted origins inside its own routes, but MindPay also exposes
authenticated organization and passkey mutations under `/api/v1`. Relying on route-local checks
would leave browser policy inconsistent and make new mutation routes easy to expose without CORS or
CSRF enforcement.

Better Auth includes a rate limiter, but its default memory storage is process-local. A Cloudflare
Worker can run across many short-lived isolates, so memory counters do not provide a durable or
coherent abuse boundary. Client IP selection must also reject attacker-controlled forwarding
headers.

## Decision

Apply one browser security middleware before every `/api/*` handler. A request that supplies an
`Origin` must match a configured trusted origin exactly. Untrusted and `null` origins fail with a
stable 403 response before authentication or application logic runs. Credentialed unsafe requests
must supply a trusted origin, and cross-site Fetch Metadata on an unsafe or credentialed request is
also rejected.

Allow requests without browser origin or credential metadata so server and native clients can use
the API. Better Auth's own CSRF, origin, and Fetch Metadata checks remain enabled as defense in
depth.

For an allowed browser origin, return that exact origin with credentials enabled and
`Vary: Origin`; never return a wildcard. Preflights accept only GET, HEAD, POST, PATCH, DELETE, and
OPTIONS, and only `Content-Type`, `Idempotency-Key`, plus `x-mindpay-organization-id`. The browser
is not allowed to send an authorization header because the browser session boundary is
cookie-only. Expose only `X-Retry-After` and cache a successful preflight for ten minutes.

Enable Better Auth rate limiting in every runtime environment and store counters in D1. Use its
atomic database consume path with a default limit of 120 requests per 60 seconds. Apply tighter
limits of five requests per 60 seconds to email sign-up, email sign-in, and password changes, and
30 requests per 60 seconds to sign-out.

Use only Cloudflare's `CF-Connecting-IP` header for rate-limit identity and session IP tracking;
ignore `X-Forwarded-For`. Normalize IPv6 clients to a /64 subnet. Store the Better Auth rate-limit
key, count, and last-request epoch in the `rate_limit` table with a unique key and an index for stale
row pruning.

Keep session cookies host-only, HttpOnly, `SameSite=Lax`, path `/`, and `Secure` whenever the public
auth URL uses HTTPS. Do not add a `Domain` attribute.

## Consequences

- Auth, organization, passkey, and demo-workspace routes share the same fail-closed browser policy
  before route code executes.
- Adding a browser-visible method or request header requires an explicit allowlist change and test.
- Originless machine requests remain possible, but an unsafe request carrying a browser cookie is
  rejected without a trusted origin.
- Authentication abuse counters survive Worker isolate churn and concurrent requests increment the
  D1 row atomically.
- Rate-limit keys contain the normalized client IP and auth path. They are operational security
  data and must follow the deployment's log and data-retention policy.
- A future cross-site OAuth provider callback may require a narrow protocol-specific middleware
  exception backed by state verification. No social provider is enabled in the current boundary.

## Alternatives considered

- Applying CORS independently to each route group was rejected because a new mutation could omit
  the policy.
- Returning no CORS header for an untrusted origin without rejecting the request was rejected
  because the server-side mutation could still occur even if the browser hid the response.
- Requiring `Origin` on every unsafe request was rejected because it would unnecessarily exclude
  non-browser clients. Cookie credentials or browser Fetch Metadata make the requirement
  fail-closed where CSRF is possible.
- Using Better Auth's memory rate limiter was rejected because counters would be isolate-local.
- Trusting `X-Forwarded-For` was rejected because a direct client can vary it unless every proxy hop
  is authenticated and configured.

## Verification

- `pnpm verify:phase-02`
- `pnpm --filter @mindpay/db test`
- `pnpm --filter @mindpay/gateway test`
- `pnpm check`
- `pnpm build`
