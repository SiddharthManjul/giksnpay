# ADR-0001: Monorepo and payment authority boundaries

- Status: Accepted
- Date: 2026-08-28
- Owners: MindPay engineering

## Context

MindPay must let an agent propose commerce without allowing model output, browser text, or the
platform itself to impersonate payment-provider truth. The reference merchant must remain a real
separate participant while shared contracts stay synchronized.

## Decision

Use a pnpm/Turborepo monorepo with three deployables: `apps/web`, `apps/gateway`, and
`apps/merchant-signalworks`. Cross-application schemas live in `packages/contracts`.

The Gateway owns mandate, policy, risk, budget, orchestration, and cross-party evidence. SignalWorks
owns Razorpay credentials, order creation, callback and webhook verification, and service
fulfilment. The browser and model are never authoritative for financial state.

## Consequences

- Gateway and merchant failures can be isolated and reconciled through signed messages.
- Contract changes must update both deployables in the same coordinated change.
- Local development and CI must build all three applications.
- Deployment requires separate Cloudflare resources and secret scopes.

## Alternatives considered

- A single Worker was rejected because it erases the merchant trust boundary.
- Separate repositories were rejected for the Buildathon because synchronized protocol changes
  would be slower and more error-prone.
- Direct model-to-Razorpay tools were rejected because model output cannot hold payment authority.

## Verification

- Contract tests will verify signed gateway-to-merchant messages.
- Security tests will prove browser and agent inputs cannot advance payment state.
- CI builds and tests every workspace from one frozen lockfile.
