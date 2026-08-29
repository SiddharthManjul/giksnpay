# ADR-0008: Cookie-only Better Auth boundary

- Status: Accepted
- Date: 2026-08-29
- Owners: MindPay engineering

## Context

MindPay needs a Worker-compatible account and session implementation before organization
authorization and passkey enrollment can be built. The existing D1 schema deliberately matches the
current Better Auth `user`, `session`, `account`, and `verification` models.

Better Auth sets an HttpOnly session cookie, but its successful sign-in responses also contain the
raw database session token in JSON. Returning that token to browser JavaScript would create a second
credential channel, weaken the value of the HttpOnly cookie, and conflict with MindPay's requirement
that session tokens never enter browser bundles, application state, or logs.

## Decision

Use `better-auth/minimal` with the Drizzle SQLite adapter and Cloudflare D1. Mount the handler at
`/api/auth/*` in the Gateway. Enable email and password authentication as the deterministic fallback
needed for the first demo; provider credentials remain future runtime configuration.

Store sessions only in D1. Use seven-day expiry, one-day refresh, five-minute freshness, and disable
cookie caching so every authenticated request observes database revocation. Set auth cookies to
HttpOnly, `SameSite=Lax`, path `/`, and `Secure` whenever the configured public auth URL is HTTPS.
Keep Better Auth's CSRF and origin checks enabled and require an explicit trusted-origin list.

Treat the HttpOnly cookie as the only browser credential. After Better Auth handles a request, the
Gateway recursively removes `token`, `sessionToken`, `accessToken`, `refreshToken`, and `idToken`
properties from every JSON response while preserving status, content type, and cookie headers.
Redirect and other non-JSON responses pass through unchanged.

Generate namespaced canonical ULIDs for every known Better Auth core model and reject unknown model
requests. Encrypt stored OAuth tokens, hash verification identifiers, disable account linking,
disable Better Auth logs and telemetry, and load `BETTER_AUTH_SECRET` exclusively from the Worker
secret binding. Secrets never appear in tracked Wrangler variables.

## Consequences

- Browser clients cannot deliberately copy a session token into local storage or an authorization
  header; they rely on cookie credentials.
- Sign-out deletes the D1 session, and the old cookie fails immediately because no signed cookie
  cache can outlive revocation.
- Native or machine clients that require bearer credentials need a separate, explicitly designed
  authentication boundary rather than reusing browser sign-in responses.
- Disabling auth logs favors credential safety during foundation work. Later structured auth
  observability must redact credentials before the logger is enabled.
- Explicit CORS behavior, auth mutation rate limits, and deeper CSRF/session-fixation adversarial
  coverage remain MP-0205 work.

## Alternatives considered

- Returning Better Auth's default JSON unchanged was rejected because it exposes the raw session
  token to browser JavaScript.
- Enabling signed cookie caching was rejected because a revoked database session could remain valid
  until the cache duration elapsed.
- Implementing custom account and password storage was rejected because it would duplicate an
  established auth boundary and drift from the verified core schema.
- Enabling debug auth logging was rejected because framework behavior and future providers could
  accidentally emit credentials.

## Verification

- `pnpm --filter @mindpay/gateway test`
- `pnpm --filter @mindpay/gateway typecheck`
- `pnpm check`
- `pnpm build`
