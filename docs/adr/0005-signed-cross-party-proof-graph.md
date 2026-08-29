# ADR-0005: Signed cross-party proof graph

- Status: Accepted
- Date: 2026-08-29
- Owners: MindPay engineering

## Context

MindPay policy, payment reconciliation, fulfilment, audit, and public verification exchange objects
between separately deployed principals. A syntactically valid payment or fulfilment record is not
authority on its own: it must identify its issuer and audience, bind the exact transaction and
checkout, have a bounded lifetime, select a verification key, and resist replay. The final evidence
bundle must carry enough redacted data to verify its audit chain without trusting database summary
fields.

## Decision

Treat the strict Zod schemas in `@mindpay/contracts` as the authoritative version 1 boundary for
open and closed mandates, merchant events, audit events, entitlements, and evidence bundles.
Generate draft 2020-12 JSON Schemas from those definitions for external consumers.

Every signed payload contains a schema version, canonical HTTPS issuer and audience, `kid`,
canonical UTC issuance and expiry timestamps, and exactly the replay identifier used by its family:
mandates use a nonce; merchant events, audit events, entitlements, and evidence use a JTI. Signature
bytes remain in the canonical ES256 envelope defined by `@mindpay/crypto`. Verification must reject
an envelope whose `kid` does not equal the payload `kid`.

Use the four compatibility labels specified by MindPay for open checkout, open payment, closed
checkout, and closed payment mandates. This is AP2-aligned terminology, not a claim of AP2 or
selective-disclosure conformance. Closed mandates carry hashes of their open authority and the
merchant checkout. The closed payment mandate additionally binds the closed checkout mandate,
amount, INR currency, payee, approved rail, and payment-attempt number.

Merchant reconciliation events carry both the claimed transaction money and the verified provider
money. Runtime validation requires both amount and currency to match, and requires captured or paid
facts for event types that assert them. Entitlements bind their JTI to their one-time entitlement ID,
their subject to the exact agent, and the transaction, merchant, service, checkout hash, INR amount,
and scope.

Audit events include the redacted payload, payload hash, previous hash, event hash, zero-based
sequence, actor, and signed timestamp. A root event must have no previous hash and every later event
must have one. Evidence bundles include the signed audit events rather than only a summary. Runtime
validation checks contiguous sequence numbers, every previous-hash link, root and final hashes,
transaction IDs, mandate proof hashes, checkout IDs, INR money, and state-specific payment and
fulfilment proofs. Completed evidence requires reconciled payment and consumed entitlement proofs;
blocked evidence forbids both; failed-payment evidence requires uncaptured payment proof and forbids
fulfilment.

All hashes use 64-character lowercase hexadecimal SHA-256 representation. Parsed protocol objects,
arrays, and fixed nested records are frozen. Arbitrary audit payload keys are allowed only inside the
explicit redacted payload boundary and are covered by its hash and signature.

## Consequences

- Policy and payment code receive one immutable contract vocabulary instead of service-local DTOs.
- Missing issuer, audience, key, lifetime, replay, open-mandate, checkout, provider, entitlement, or
  WebAuthn proof bindings fail before state transitions.
- Currency is version 1 INR only, and all monetary values remain non-negative safe integers in
  paise.
- The public verifier can check every included audit link and proof reference from the evidence
  object itself.
- JWT adapters may map the semantic issuer, audience, issuance, and expiry fields to registered JWT
  claims, but the canonical contract remains the signed source and timestamps remain canonical UTC.
- Cross-field refinements are authoritative runtime checks. JSON Schema consumers must still submit
  objects to MindPay validation and cryptographic verification before trusting them.
- Adding another currency, rail, replay model, proof type, or compatibility claim requires an
  explicit schema-version decision.

## Alternatives considered

- Optional proof metadata was rejected because it permits unsigned context and replay ambiguity.
- Trusting a single amount field from a merchant event was rejected because provider evidence could
  be attached to a different checkout amount.
- Publishing only audit root and final hashes was rejected because a verifier could not prove the
  intervening chain.
- Reusing mutable database rows as public contracts was rejected because storage lifecycle and
  cross-party authorization semantics differ.
- Claiming full AP2 compatibility was rejected until the pinned mapping and conformance work exists.

## Verification

- Frozen reference fixtures validate all four mandate forms, a reconciled SignalWorks event, a
  two-event audit chain, a one-time entitlement, and a completed evidence graph.
- Tests remove every common signed claim and required proof binding and confirm fail-closed behavior.
- Tests reject threshold and budget inversions, fractional or non-INR money, mismatched checkout and
  provider amounts, invalid reconciliation facts, entitlement identity changes, broken audit links,
  cross-transaction proofs, and incomplete state-specific evidence.
- Merchant manifest, catalog, offer, and checkout tests enforce the same common signed claims and
  exact-origin issuer binding.
- Generated JSON Schemas are stable, frozen, serializable draft 2020-12 documents.
