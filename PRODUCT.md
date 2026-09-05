# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Inferred from `Mindpay.md`: the primary users are people who configure autonomous purchasing
agents, set financial authority, review exceptions, and inspect transaction evidence. Merchant and
platform reviewers are secondary users responsible for verification, quarantine, and incident
resolution. Public verifiers need to inspect a transaction proof without an account.

## Product Purpose

MindPay lets autonomous agents discover and propose purchases while deterministic, user-authorized
software retains control of policy, approval, payment, fulfilment, and evidence. Success means an
operator can understand and control every money decision, and an independent reviewer can verify
the resulting proof graph.

## Positioning

MindPay is a financial control plane for agent commerce. Models may interpret intent and compare
offers, but signed mandates and deterministic services alone can authorize money movement.

## Operating Context

Users work across a public marketplace, agent builder, mandate builder, agent workspace,
transaction detail, evidence verifier, and administrative review surfaces. The reference commerce
flow uses verified SignalWorks services, Razorpay Test Mode, short-lived one-time entitlements,
signed merchant receipts, and a public redacted evidence bundle.

## Capabilities and Constraints

- Product facts are defined by `Mindpay.md` and implemented in dependency order.
- Money is stored as integer currency subunits and timestamps are UTC.
- Every mutation is idempotent; money transitions are auditable and hash-linked.
- D1 is canonical business state. KV, R2, queues, and Durable Objects are supporting stores.
- Shared Zod contracts own cross-application API and business enums.
- Model output cannot authorize policy, risk, payment, verification, entitlement, fulfilment, or
  audit decisions.
- Published agents, merchants, services, catalogs, and protocol versions are immutable.
- Public evidence cannot expose prompts, PII, secrets, passkey challenges, raw provider payloads,
  private keys, or webhook secrets.

## Brand Commitments

The confirmed product name is MindPay. The source specification requires a serious
financial-control product rather than a hackathon dashboard. Product language must be exact,
calm, and explicit about authority, verification, failure, and recovery.

## Evidence on Hand

- `Mindpay.md` contains the complete product, architecture, API, frontend, test, and demo
  specification.
- `docs/backlog/` contains dependency-ordered acceptance criteria.
- Shared signed protocol fixtures exist in `packages/contracts/src/fixtures/`.
- No customer testimonials, production usage claims, or production payment claims are available
  and none may be fabricated.

## Product Principles

1. Show who has authority before asking the user to act.
2. Derive every financial state from canonical server evidence.
3. Explain blocks and failures with the violated rule, actual value, expected value, and recovery.
4. Keep verification inspectable by default and sensitive material absent by construction.
5. Make the common path fast without concealing policy, payment, or evidence transitions.

## Accessibility & Inclusion

The web product must support keyboard navigation, visible focus, WCAG AA contrast, reduced motion,
and responsive layouts from 360 px through large desktop. Status must use text and an icon or shape,
never color alone.
