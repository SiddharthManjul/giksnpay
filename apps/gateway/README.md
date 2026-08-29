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

`BETTER_AUTH_URL` and `TRUSTED_ORIGINS` are non-secret local defaults in `wrangler.jsonc`.
Preview and production deployments must replace them with HTTPS origins. Never add
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
- CSRF and origin validation remain enabled. Explicit CORS and auth rate-limit hardening are tracked
  separately by MP-0205.

Run the isolated D1 lifecycle test with:

```sh
pnpm --filter @mindpay/gateway test
```
