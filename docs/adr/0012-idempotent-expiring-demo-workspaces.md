# ADR-0012: Idempotent expiring demo workspaces

- Status: Accepted
- Date: 2026-08-29
- Owners: MindPay engineering

## Context

The public demo needs to give each authenticated judge an isolated organization without requiring
manual seed work. Retrying the launch action must not create duplicate organizations, and one
judge's workspace identifier must not grant another judge access. Demo resources also need an
explicit lifetime so they do not behave like permanent tenant data.

The existing `idempotency_records` table can claim request keys and persist exact responses, while
organization authorization already constrains every object lookup by organization membership.
Permanent organizations have no expiry, so adding a required expiry directly to that table would
mix two different lifecycle models.

## Decision

Expose authenticated `POST /api/v1/demo-workspaces`. Require a canonical `Idempotency-Key` header
and accept an optional, bounded workspace name. Add the header to the credentialed CORS preflight
allowlist.

Scope an idempotency key to the operation and authenticated user. Hash the canonical normalized
request together with the operation and user ID. The first request claims a `PENDING` record. Reuse
with a different hash returns `409`; reuse with the same hash returns the exact stored status and
validated response. Concurrent identical requests briefly re-read the claimed record and converge
on the completed response. A request that remains pending returns an explicit retryable `409`
instead of creating another workspace.

Generate the organization ID and collision-resistant slug at the Gateway. Use one D1 batch to
insert the organization, add the authenticated user as its OWNER, insert demo expiry metadata, and
mark the idempotency record `COMPLETED` with the exact 201 response. A batch failure is represented
as a stored generic failure response and does not expose database details.

Store demo lifecycle fields in a separate `demo_workspaces` table keyed by organization ID. Every
demo expires 24 hours after creation. Current-organization authorization and `/api/v1/me` use a left
join: permanent organizations remain eligible, while demo organizations are eligible only before
their expiry. Expired rows remain stored for later cleanup and evidence work but are no longer
discoverable, readable, or mutable through tenant APIs.

Expire the idempotency record at the same instant as the demo. After that point, the same key can
launch a fresh workspace rather than replaying an expired response.

## Consequences

- Sequential and concurrent retries with identical input create one organization and return one
  stable response.
- The same literal key can be used independently by different authenticated users without sharing
  a workspace.
- The membership boundary remains authoritative: knowing another demo's organization ID yields the
  same 404 as a nonexistent organization for both reads and mutations.
- Permanent organizations do not need synthetic expiry values or special status transitions.
- A Worker termination after claiming a key but before starting the D1 batch can leave a pending
  record until expiry. Replays fail closed as in-progress; a future cleanup job may reclaim stale
  claims with an explicit lease policy.

## Alternatives considered

- A shared public demo organization was rejected because concurrent judges could observe or mutate
  each other's state.
- Using only a unique organization slug as deduplication was rejected because it cannot detect the
  same key paired with changed input or replay an exact response.
- Putting nullable expiry columns on every organization was rejected because demo lifecycle is not
  a property of permanent tenants.
- Returning success while an identical request is still pending was rejected because there is no
  authoritative workspace response to return yet.
- Deleting expired workspaces synchronously on reads was rejected because reads should not perform
  destructive lifecycle work and later audit/evidence tickets may need retained metadata.

## Verification

- `pnpm verify:phase-02`
- `pnpm --filter @mindpay/contracts test`
- `pnpm --filter @mindpay/db test`
- `pnpm --filter @mindpay/gateway test`
- `pnpm check`
- `pnpm build`
