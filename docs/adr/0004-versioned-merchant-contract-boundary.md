# ADR-0004: Versioned merchant contract boundary

- Status: Accepted
- Date: 2026-08-28
- Owners: MindPay engineering

## Context

MindPay must ingest merchant manifests, catalogs, offers, and checkout payloads without trusting
display text, floating-point prices, browser state, or arbitrary endpoints. The same contracts must
serve TypeScript applications, runtime validation, published JSON Schema consumers, and the
separately deployed SignalWorks reference merchant.

## Decision

Treat strict Zod schemas in `@mindpay/contracts` as the authoritative runtime boundary and generate
draft 2020-12 JSON Schemas from them. Version 1 merchant payloads use snake_case JSON fields,
canonical UTC timestamps, integer INR subunits, stable lowercase identifiers, canonical semantic
versions, and strict objects that reject unknown fields.

Merchant endpoints and policy links must use canonical HTTPS URLs on public hostnames. Manifests,
catalog services, offers, and checkouts additionally bind those URLs to the merchant's exact origin.
Each signed merchant object requires issuer, audience, key ID, canonical issuance and expiry, and a
nonce; the issuer must use the merchant's exact origin. A manifest's selected `kid` must identify a
manifest-capable key that was active at issuance.
Catalogs require unique stable service IDs and seller ownership. Checkout line totals and aggregate
totals are recalculated using integer arithmetic. Parsed contracts and nested version records are
frozen.

Public EC JWKs are limited to P-256 verification material and reject private `d` values. Manifests
require unique signing-key IDs, an explicit lifecycle, at least one manifest-capable key, and only
the approved Razorpay Test Mode rail.

## Consequences

- All deployables can import one TypeScript contract package while external tooling can consume
  stable JSON Schema documents.
- Prices such as ₹299 are represented only as `29900` INR subunits.
- Cross-origin endpoints, private hosts, unstable identifiers, duplicate services, and inconsistent
  totals fail before verification, indexing, policy, or payment logic.
- Cross-field rules such as exact-origin and calculated-total checks remain runtime Zod refinements;
  JSON Schema consumers must still pass payloads through MindPay verification before trust.
- Contract changes require a new schema version rather than silently widening version 1.

## Alternatives considered

- Separate hand-written TypeScript and JSON Schemas were rejected because they would drift.
- Floating major-unit prices were rejected because they are unsafe for payment decisions.
- Permissive unknown-field stripping was rejected because signed data could differ from validated
  data.
- Allowing arbitrary HTTPS policy or fulfilment origins was rejected because it expands the trusted
  merchant surface and enables endpoint substitution.

## Verification

- Reference SignalWorks manifest, three-service catalog, offer, and checkout fixtures validate.
- Tests reject unknown fields, floating or wrong-currency prices, invalid and cross-origin URLs,
  private JWK material, duplicate or unstable IDs, inverted lifetimes, and inconsistent totals.
- Generated JSON Schemas are strict, serializable draft 2020-12 objects with stable IDs.
- Parsed protocol objects and nested service versions are frozen.
