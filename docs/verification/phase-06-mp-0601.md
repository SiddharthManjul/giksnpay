# Phase 6 MP-0601 verification

- Date: 2026-08-30
- Ticket result: Pass
- Phase result: In progress
- External credentials required: None

## Boundaries verified

| Boundary | Evidence |
|---|---|
| Open mandates | Checkout and payment rows are discriminated by exact `mindpay.mandate.*.open.1` versions; database checks reject mixed constraint shapes and invalid INR, threshold, budget, count, attempt, lifecycle, and time bounds |
| Tenant ownership | Every new record owns an `organization_id`; D1 insert triggers bind user membership, agent/version, mandate, transaction, service/merchant, approval challenge, credential, amount, and provider-attempt parents to the same tenant |
| Logical approval | A partial unique index permits only one `ACTIVE` approval for an organization, transaction, and canonical payload hash; the challenge is single-use and proof-bound |
| Replay | Consumed nonces are immutable and unique by organization, scope, and nonce |
| Attempts | Attempt ordinals are limited to the protocol maximum of ten, unique per transaction, and additionally capped by the selected mandate's `max_attempts` |
| Provider evidence | `(provider, provider_event_id)` is unique; payload identity is immutable while a legal processing-state update remains possible |
| Retention | All eight new tables carry indexed retention deadlines; D1 blocks early deletion, prevents deadline shortening, and uses restrictive parent foreign keys |
| Migration integrity | Nine ordered migrations reproduce 38 tables and 57 integrity triggers across independent local D1 databases |

## Reproducible suite

`pnpm verify:phase-06` applies the complete migration history twice to one isolated database and to
a second fresh database, compares both schemas, then attacks the active-approval, nonce,
provider-event, tenant-binding, attempt-limit, immutability, and retention constraints. It also
proves that a valid provider-event processing update remains possible.

ADR-0021 records the tenant and retention boundary. MP-0601 is complete; Phase 6 remains open for
MP-0602 through MP-0608.

## Verified commands

| Command | Result |
|---|---|
| `pnpm verify:phase-06` | Pass |
| `pnpm --filter @mindpay/db typecheck` | Pass |
| `pnpm --filter @mindpay/db build` | Pass |
| `git diff --check` | Pass |
