# ADR-0026: Frontend canonical-state ledger

- Status: Accepted
- Date: 2026-09-05

## Context

The Phase 10 client must make a complicated agent-commerce lifecycle understandable without turning
the browser into an authority source. Payment, mandate, merchant, and evidence status must survive
refresh and reconnect, while passkey and Razorpay interactions necessarily begin in the browser.
The product also needs a distinctive, credible financial-control interface across 360-pixel mobile
screens and large desktops.

## Decision

The web application uses a clearing-house settlement-ledger direction: cool paper and ink surfaces,
one emerald signal color, ruled registers, compact controls, and tabular financial figures. Status
always carries text and an icon. Critical payment screens use a single progression and explicit next
valid action instead of a generic card dashboard. The direction contract is embedded in the built
artifact and documented in `PRODUCT.md` and `DESIGN.md`.

Every cross-application response is parsed by a shared contract from `packages/contracts` or a local
Zod view over an explicitly unstructured evidence field. TanStack Query owns server state. Zustand
stores only the reversible workspace selection. The client performs no optimistic updates to money,
mandates, approvals, merchant assurance, or transactions.

Agent intent runs and manual fallback both reach the same signed proposal contract. A server-side
purchase-preparation endpoint selects the active mandate pair and obtains a signed merchant checkout;
the browser never constructs commerce authority. Transaction actions are rendered exclusively from
canonical state. Passkey challenges bind the exact server payload. Razorpay receives only the safe
public checkout configuration; its callback is posted through an authenticated Gateway route and is
verified by SignalWorks using the stored order and server-only key secret. Callback evidence remains
non-authoritative until provider reconciliation.

Transaction WebSocket messages trigger refetches only. Polling remains active for non-terminal states,
so refresh, missed events, or reconnect converge on D1. Evidence pages display the public verifier's
nine proof outcomes and link only to the redacted download.

## Consequences

- The browser can request an allowed action but cannot invent payment or approval state.
- A pending Razorpay order can be resumed after refresh from a safe server-stored order snapshot.
- Failed payments expose a retry only when the Gateway can reserve it under the existing mandate.
- Blocked transactions show structured policy/risk evidence and explicitly state that no order or
  budget reservation was created.
- Admin controls remain visible only for capable roles and are rechecked by the API.
- The content-security policy allows the narrow Razorpay checkout surface and exact configured API
  origin; production must provide HTTPS origins.

## Rejected alternatives

- Browser-generated checkout, offer, mandate, or policy objects were rejected because they would let
  client state enter the authority path.
- Optimistically marking approvals or payments successful was rejected because a refresh could reveal
  contradictory financial truth.
- Treating a WebSocket event as a state transition was rejected because delivery is not canonical or
  exactly once.
- A decorative card-grid dashboard was rejected because it obscures ordering, exact amounts, and the
  next valid action.
