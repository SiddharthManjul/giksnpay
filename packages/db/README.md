# `@mindpay/db`

This package owns MindPay's typed Cloudflare D1 boundary and ordered SQL migrations.

## Phase 2 foundation

The first migration creates:

- Better Auth-compatible `user`, `session`, `account`, and `verification` tables;
- `organizations` and `organization_members` with fixed role and lifecycle checks;
- single-use replay nonce and approval challenge records;
- request-hash-bound idempotency records; and
- hash-linked `audit_events` protected by D1 update and delete rejection triggers.

Timestamps are UTC epoch milliseconds. JSON columns are storage-only values and must still be
validated by their owning contract before insertion and after retrieval.

## Commands

From the repository root:

```sh
pnpm --filter @mindpay/db typecheck
pnpm --filter @mindpay/db test
pnpm --filter @mindpay/db build
```

The test command applies all migrations twice to one isolated local D1 database, applies them to a
second empty database, compares the resulting schemas, and exercises uniqueness, lifecycle, hash,
foreign-key, and append-only audit constraints.

When the typed schema changes, generate a new ordered migration from this package directory:

```sh
pnpm generate -- --name <migration_name>
```

Never rewrite an applied migration. Drizzle does not generate D1 triggers, so trigger changes must
be explicit SQL in a new migration and covered by `migrations:verify`.

`wrangler.jsonc` contains a local-only database identity for reproducible tests. Deployment database
IDs and bindings are configured when Cloudflare environments are provisioned.
