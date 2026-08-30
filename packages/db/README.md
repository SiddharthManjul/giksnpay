# `@mindpay/db`

This package owns MindPay's typed Cloudflare D1 boundary and ordered SQL migrations.

## Phase 2 foundation

The first migration creates:

- Better Auth-compatible `user`, `session`, `account`, and `verification` tables;
- `organizations` and `organization_members` with fixed role and lifecycle checks;
- single-use replay nonce and approval challenge records;
- request-hash-bound idempotency records; and
- hash-linked `audit_events` protected by D1 update and delete rejection triggers.

The second migration adds membership triggers that reject deleting, demoting, or moving the final
OWNER of an organization. Application role checks provide a friendly conflict response, while the
trigger protects the invariant when concurrent requests race.

The third migration adds session- and origin-bound passkey registration challenges plus public
credential storage. Challenges are hashed at rest and have explicit expiry and consumption fields.
Credential rows store only public verification material and authenticator metadata; no private-key
field exists.

The fourth migration adds Better Auth's durable `rate_limit` model. Its unique request key and
positive counter are updated through Better Auth's atomic database consume path so authentication
limits remain coherent across concurrent Worker isolates.

The fifth migration adds `demo_workspaces`, keeping 24-hour demo expiry metadata separate from
permanent organizations. The organization foreign key cascades lifecycle cleanup, while the expiry
index supports authorization and future cleanup scans.

The sixth migration adds canonical merchant review state, public keys, immutable manifests,
catalogs, verification checks and service versions, append-only administration events, and the D1
generation used to validate KV marketplace documents. A current-event trigger turns merchant
revision updates into a compare-and-swap boundary, preventing concurrent reviewer actions from
both committing. Verification expiry is stored separately from verification time so discovery can
fail closed without another write.

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
