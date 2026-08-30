# Phase 4 verification

- Date: 2026-08-30
- Result: Pass
- External credentials required: None

## Marketplace boundaries verified

| Boundary | Evidence |
|---|---|
| Administration | Submission, verification, reverification, and suspension require an authenticated organization capability, an idempotency key, and an append-only audit event |
| Network trust | Merchant discovery is HTTPS-only, resolves to public IP space, never follows redirects, binds exact requested and response origins, and bounds remote reads by time and size |
| Signed evidence | Strict manifest and catalog schemas verify merchant, audience, domain, active keys, expiry, stable IDs, integer INR prices, fulfilment, and `razorpay:test` |
| State machine | Approval follows all five checks; material changes require review; signature failure quarantines immediately |
| Canonical index | D1 stores immutable verified publications and service versions; only active, approved, unexpired rows feed discovery |
| Cache coherence | KV documents require the current D1 generation and unexpired verification evidence; stale cache injection is rejected |
| Public APIs | Search filters and opaque cursor pagination are deterministic; detail and trust responses expose ACP transaction protocol separately from fulfilment and return only the latest verification run without key material |
| Continuous checks | Safe signed catalog versions re-index, key changes pause discovery for review, invalid signatures quarantine, and expiry removes discovery without a new write |

## Reproducible exit suite

`pnpm verify:phase-04` runs four fail-fast layers:

1. shared reviewer capabilities and domain rules;
2. strict manifest, catalog, marketplace, signature, redirect, and failure-reason contracts;
3. reproducible D1 migrations, constraints, and immutability triggers; and
4. Gateway administration, verification, state, indexing, cache, and marketplace integration tests.

The end-to-end lifecycle begins with an undiscoverable submission, approves the signed SignalWorks
catalog, exercises deterministic pagination and trust details, re-indexes a safe version change,
requires review for a new signing key, quarantines a one-byte signature mutation, rejects an
injected stale KV document, recovers through reviewer approval, ages out expired evidence, and
removes a suspended merchant. Exact idempotent replay creates no duplicate audit event, and a
VIEWER cannot perform administration.

The passing focused run covers 261 Vitest cases: 67 domain and authorization cases, 120 strict
shared-contract cases, 7 D1 schema cases plus the migration integrity probes, and 67 Gateway unit
and integration cases.

## Verified commands

| Command | Result | Proves |
|---|---|---|
| `pnpm verify:phase-04` | Pass | Focused Phase 4 contracts, D1 integrity, and complete marketplace lifecycle |
| `pnpm check` | Pass | Formatting, lint, strict typecheck, and all repository tests |
| `pnpm build` | Pass | All application and package production builds |
| `git diff --check` | Pass | No malformed patch whitespace |

## Architecture record

ADR-0017 records the canonical D1 authority, automatic review/quarantine policy, immutable index,
and generation-plus-expiry KV acceptance rule.

## Result

The Phase 4 exit gate is satisfied: only approved and unexpired merchants are discoverable;
material changes stop discovery for review; signature failures quarantine immediately; signed
catalog versions re-index immutable services; and stale KV cannot override canonical D1 state.
