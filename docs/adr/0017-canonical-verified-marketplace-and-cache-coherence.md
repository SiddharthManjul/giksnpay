# ADR-0017: Canonical verified marketplace and cache coherence

- Status: Accepted
- Date: 2026-08-30

## Context

MindPay must discover merchant services quickly without allowing a stale cache, a failed
reverification, or merchant-controlled JSON to become purchasing authority. Merchant manifests and
catalogs are signed external evidence; D1 is the Gateway's canonical reviewed state; KV is only a
public-read accelerator.

## Decision

The Gateway owns merchant submissions, reviewer actions, verification runs, approved publication
snapshots, immutable service versions, and append-only administration events in D1.

Verification resolves the submitted hostname before either merchant fetch, rejects non-public
addresses, uses HTTPS and manual redirects, binds the response to the exact requested/final URL,
limits remote reads to five seconds and one megabyte, and applies strict manifest and catalog
schemas. Canonical ES256 verification binds the expected
audience, merchant, domain, active key, expiry, integer INR service price, fulfilment tool ID, and
approved `razorpay:test` rail. Every rejected check has a stable reason and evidence record.

Approval follows the explicit `SUBMITTED → DOMAIN_VERIFIED → KEY_VERIFIED → CATALOG_VALIDATED →
PAYMENT_CONFIGURATION_VERIFIED → APPROVED` path inside one atomic reviewer mutation. A signed safe
catalog-version change creates immutable service versions and re-indexes. Key, domain, endpoint,
payment-rail, catalog-version replay, or same-version service mutation enters `REVIEW_REQUIRED`.
Signature failure enters `QUARANTINED` immediately. Reviewer mutations use request-bound
idempotency and a compare-and-swap revision marker; the merchant row, event, verification checks,
index, cache generation, and stored response commit atomically.

KV contains only typed public search documents. Every document carries the D1 generation and the
earliest verification expiry. A read accepts KV only when both still match canonical D1/time.
Otherwise it rebuilds from active, approved, unexpired D1 state. Cache write failure can reduce
performance but cannot restore stale, suspended, quarantined, or expired discovery data.
Trust responses select checks from the latest verification run only, and service responses describe
the ACP transaction protocol independently from MCP or REST fulfilment transport.

## Consequences

- Public marketplace responses never trust live merchant JSON or KV alone.
- Material changes require a fresh reviewer approval before discovery resumes.
- Signature incidents and evidence expiry fail closed without waiting for cache deletion.
- Service versions and verification evidence remain reviewable and immutable.
- DNS-to-fetch rebinding cannot be completely pinned by the Worker Fetch API; public-address
  resolution is therefore one fail-closed layer alongside exact HTTPS origin and redirect checks.
