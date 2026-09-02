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

The seventh migration adds organization-scoped agents, immutable agent versions, encrypted private
signing-key envelopes, public JWKs, and versioned tool bindings. Publication triggers reject every
subsequent version update or delete and every bound-tool insert, update, or delete. The agent's
current-version pointer can reference only one of its own published versions.

The eighth migration adds persisted agent runs, typed tool-call evidence, and contiguous run events.
Runs must use the organization's current published agent version; tool calls must use one of that
version's immutable bindings. Run identity, terminal runs, terminal tool calls, and every event are
immutable, while event insertion enforces an unbroken zero-based sequence.

The ninth migration adds tenant-owned open mandates and proofs, transaction records and passkey
approvals, consumed nonces, spend reservations, bounded payment attempts, and provider-event
evidence. Partial and composite unique indexes reject duplicate active approvals, consumed nonces,
attempt ordinals, and provider event IDs. D1 tenant-binding triggers prevent cross-organization
parent references, identity triggers freeze signed and monetary inputs, and every table has an
indexed retention deadline with a pre-expiry delete guard. Parent foreign keys use `RESTRICT`, so
organization cleanup cannot silently remove retained payment evidence.

The thirteenth migration isolates AI concurrency leases and minute token-usage windows from Better
Auth's framework-owned rate-limit table. This prevents authentication cleanup behavior from
changing the model capacity boundary, while indexed expiry and window timestamps keep cleanup
bounded.

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
foreign-key, append-only audit, agent-key storage, current-version, publication-immutability,
bound-tool evidence, terminal-run, contiguous-event, tenant-binding, replay, approval, attempt-limit,
provider-event, and retention constraints.

When the typed schema changes, generate a new ordered migration from this package directory:

```sh
pnpm generate -- --name <migration_name>
```

Never rewrite an applied migration. Drizzle does not generate D1 triggers, so trigger changes must
be explicit SQL in a new migration and covered by `migrations:verify`.

`wrangler.jsonc` contains a local-only database identity for reproducible tests. Deployment database
IDs and bindings are configured when Cloudflare environments are provisioned.
