# ADR-0015: Immutable signed SignalWorks service catalog

- Status: Accepted
- Date: 2026-08-30
- Owners: MindPay engineering

## Context

SignalWorks must publish three purchasable research services at ₹299, ₹449, and ₹799 while keeping
service identity, price, fulfilment, and policy terms stable after publication. A mutable database
row would let an existing `service_id` and version silently change meaning after a buyer or mandate
had selected it. Application-only checks are insufficient because an alternative query, accidental
upsert, or direct D1 operation could bypass them.

The catalog is also an unauthenticated network response. Consumers need to distinguish stable
service-version data from the fresh issuance, nonce, expiry, and signature used for each response.

## Decision

Store each published service in the SignalWorks D1 database under the composite identity
`(merchant_id, service_id, version)`. Persist every contract field as a typed column, including the
integer INR subunit price, fulfilment type and tool ID, exact-origin policy URLs, availability, and
fixed publication timestamp.

Make published rows append-only. D1 triggers reject every update and delete. A separate before-
insert trigger rejects a conflicting row even when the caller uses `INSERT OR REPLACE` or an upsert
form. An exact duplicate insert may be ignored, which keeps the seed idempotent without permitting
field changes. Database checks constrain currency, integer price, identifiers, semantic-version
shape, availability, fulfilment, delivery bounds, policy origin, and timestamps; the read path then
passes every row through the strict shared service contract.

Seed exactly these version `1.0.0` services with a fixed `2026-08-27T12:00:00.000Z` publication
timestamp:

- `market_snapshot`: `29900` INR subunits, fulfilled by `redeem_market_snapshot`.
- `detailed_competitor_dossier`: `44900` INR subunits, fulfilled by
  `redeem_competitor_dossier`.
- `enterprise_intelligence_pack`: `79900` INR subunits, fulfilled by
  `redeem_enterprise_intelligence`.

Publish `GET /catalog/feed.json` as a strict `{ catalog, signature }` envelope. The catalog has the
stable identity `catalog_signalworks`, version `1.0.0`, exact SignalWorks issuer and seller, the
MindPay API audience, and the three persisted service records ordered by price. Each request gets a
fresh canonical nonce and issuance time. Expiry is at most 24 hours and is shortened to an earlier
catalog-key retirement or revocation boundary. Only the catalog-purpose key signs the canonical
catalog payload. Responses use `Cache-Control: no-store`.

Changing a service requires inserting a new version and deliberately publishing a new catalog
version; it cannot rewrite the version already referenced by a checkout, mandate, entitlement, or
evidence record.

## Consequences

- Service IDs, version `1.0.0` content, paise prices, and publication timestamps remain identical
  across seed and feed refreshes.
- Direct updates, deletes, conflicting inserts, replacement inserts, and changed seed definitions
  fail closed at D1.
- Fresh catalog responses differ in nonce, issuance, expiry, and signature without changing the
  published service versions.
- A one-byte catalog mutation fails canonical ES256 verification.
- Operational availability changes require a new immutable service version rather than mutating an
  already published purchase contract.
- Later catalog versions need an explicit selection mechanism and catalog-version bump; the current
  reader intentionally fails if version `1.0.0` no longer matches the three reference services.

## Alternatives considered

- Storing the three services only in source constants was rejected because checkout and later
  evidence flows need a durable persistence boundary.
- Allowing price or availability updates in place was rejected because the same service version
  would acquire different purchasing semantics over time.
- Relying only on `ON CONFLICT DO NOTHING` was rejected because alternative update and replacement
  statements could still mutate published records.
- Signing each service independently was rejected for this phase because one catalog signature
  already binds the complete ordered service set, seller, version, audience, and lifetime.
- Long-lived cacheable catalog responses were rejected because key lifecycle and availability
  metadata must be refreshed promptly.

## Verification

- `pnpm --filter @mindpay/merchant-signalworks seed:local` twice
- `pnpm --filter @mindpay/contracts test`
- `pnpm --filter @mindpay/merchant-signalworks test`
- `pnpm check`
- `pnpm build`
