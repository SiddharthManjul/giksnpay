# ADR-0007: D1 identity and integrity foundation

- Status: Accepted
- Date: 2026-08-29
- Owners: MindPay engineering

## Context

Authentication, organization authorization, passkey approvals, idempotent mutations, replay
protection, and evidence generation all depend on shared persistence semantics. If each feature
introduces its own identifiers, timestamps, uniqueness rules, or cleanup behavior, concurrency and
authorization failures will appear at integration time. Cloudflare D1 provides SQLite constraints
and triggers, while Drizzle provides a Worker-compatible typed query boundary.

Better Auth's current core relational schema uses singular `user`, `session`, `account`, and
`verification` models. Its account identity is the pair `(issuer, account_id)`, independent of the
configured provider connection. MindPay must preserve those model and property mappings so the
Drizzle adapter can be introduced without a second identity schema.

## Decision

Use `packages/db/src/schema.ts` as the typed D1 schema authority and checked-in ordered SQL under
`packages/db/migrations` as the deployment authority. The initial migration creates ten tables:
the four Better Auth core tables plus organizations, memberships, replay nonces, approval
challenges, idempotency records, and audit events.

Store timestamps as integer UTC epoch milliseconds. Enforce fixed organization roles, lifecycle
states, non-empty identity fields, time ordering, lowercase SHA-256 digests, and response/state
consistency with D1 `CHECK` constraints. Enforce identity, session token, organization slug, replay,
challenge, idempotency, and audit sequence uniqueness with primary keys or unique indexes. Foreign
keys cascade only for records whose ownership is destroyed with a user or organization.

Treat a replay nonce insert as consumption and make `(scope, nonce)` unique. Bind each approval
challenge to an organization, user, purpose, challenge hash, payload hash, expiry, and explicit
lifecycle state. Bind each idempotency key to its scope and original request hash; pending records
cannot contain a response and terminal records must contain one.

Audit events use the frozen `mindpay.audit.event.1` contract fields, require a unique transaction
sequence, event hash, and JTI, and enforce root/non-root previous-hash shape. D1 `BEFORE UPDATE` and
`BEFORE DELETE` triggers abort all attempts to mutate an existing audit row. Application code may
only append.

Migration verification must run against the real local D1 emulator. It applies migrations twice to
one empty database, applies them independently to a second empty database, compares the resulting
schema, and proves the uniqueness, check, and append-only constraints with accepted and rejected
statements.

## Consequences

- MP-0202 can map Better Auth directly to the four core Drizzle tables.
- Authorization code receives fixed organization role values but still must enforce capabilities
  and object ownership in application queries; D1 does not provide row-level security.
- Replay and idempotency safety do not depend on a read-before-write race.
- Audit history cannot be corrected in place. Corrections must be new signed events.
- Drizzle generates tables, indexes, and checks but not the D1 audit triggers, so trigger SQL remains
  an explicit reviewed part of migrations.
- The checked-in Wrangler database identity is local-only. Remote database IDs remain deployment
  configuration and are not invented during this phase.

## Alternatives considered

- Deferring constraints to service code was rejected because concurrent Worker requests can race
  between reads and writes.
- Using separate application user tables was rejected because it would duplicate Better Auth's
  identity source and complicate sessions and account linking.
- Storing timestamps as formatted text was rejected because Better Auth and Drizzle natively map
  SQLite integer millisecond timestamps to `Date` values and numeric ordering is unambiguous.
- Allowing audit update or delete for administrators was rejected because privileged mutation would
  invalidate public evidence and hash-chain guarantees.

## Verification

- `pnpm --filter @mindpay/db migrations:verify`
- `pnpm --filter @mindpay/db test`
- `pnpm check`
- `pnpm build`
