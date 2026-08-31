# Phase 6 verification

- Date: 2026-08-30
- Result: Pass
- External credentials required: None

## Exit-gate evidence

| Scenario | Verified result |
|---|---|
| ₹299 Market Snapshot | Deterministic `ALLOW`; budget is atomically reserved; no payment-order hook is invoked |
| ₹449 Detailed Competitor Dossier | Remains `APPROVAL_REQUIRED` until an exact valid passkey assertion, then atomically reserves |
| ₹799 Enterprise Intelligence Pack | Deterministic `BLOCK` with `AMOUNT_EXCEEDED`; no reservation or payment-order hook |
| Revoked mandate | `MANDATE_NOT_ACTIVE` before reservation; budget counters remain unchanged |
| Mismatched checkout hash | Closed-mandate verification fails with `CHECKOUT_HASH_MISMATCH` |
| Concurrent reservations | D1 permits only the reservation that keeps spent plus reserved within total budget |
| Assertion replay | Consumed challenge fails before a second verifier or approval can succeed |
| Wrong origin/session | Stored challenge context does not match and remains unusable by the wrong context |
| Expired assertion | Fails without verification; a replacement challenge can be issued safely |
| Different payload | Expected canonical hash comparison fails and the claimed challenge cannot be replayed |
| Idempotency mismatch | Same key with changed input returns `IDEMPOTENCY_CONFLICT` |

## Boundaries verified

- Mandate APIs create, inspect, activate, suspend, revoke, expire, and exhaust separate canonical
  checkout and payment objects under the authenticated organization and user.
- Agent-closed objects bind the merchant checkout hash, session, offer, amount, payee, rail, open
  hashes, and exact agent version; no-expansion checks fail closed.
- AP2 mappings carry the explicit `AP2_ALIGNED_NOT_CONFORMANT` compatibility label and retain exact
  MindPay version identifiers without an SD-JWT claim.
- Policy reasons are deterministic, frozen, and ordered. Risk blocks and reviews remain authoritative
  even when an optional model signal says the transaction is safe.
- Transaction states can move only through the frozen legal transition table; blocked, cancelled,
  and expired states are terminal.
- WebAuthn challenge rows bind payload, session, user, organization, RP, origin, credential, mandate,
  and transaction. Verified assertion and counter evidence are retained.
- Reservation insertion and budget increment are one D1 statement. Commit, release, and expiry close
  reserved funds exactly once and preserve retained evidence.

## Reproducible suite

`pnpm verify:phase-06` runs five fail-fast layers:

1. canonical AP2-aligned open/closed mapping, signature, hash binding, and no-expansion tests;
2. deterministic policy property tests, ₹299/₹449/₹799 gates, stable reasons, and transaction states;
3. deterministic risk block/review tests with non-authoritative model evidence;
4. reproducible D1 migrations, 38 tables, 63 integrity triggers, retained proof bindings, atomic
   reservation races, release, terminal-once, and revoke-during-checkout enforcement; and
5. authenticated gateway integration for mandate lifecycle, passkey activation/step-up, assertion
   replay/origin/expiry/payload rejection, idempotency mismatch, and zero order side effects.

## Verified commands

| Command | Result | Proves |
|---|---|---|
| `pnpm verify:phase-06` | Pass | Focused mandate, policy, risk, WebAuthn, state, replay, and budget boundaries |
| `pnpm check` | Pass | Formatting, lint, strict typecheck, and all repository tests |
| `pnpm build` | Pass | All application and package production builds |
| `git diff --check` | Pass | No malformed patch whitespace |

## Architecture record

ADR-0021 records the tenant-owned retained persistence boundary. ADR-0022 records deterministic
commerce authority, explicit AP2 alignment, exact passkey hash binding, and database-atomic budget
closure.

## Result

All Phase 6 tickets are Done. The exit gate is reproducible without external credentials, and the
first permitted external payment side effect remains deliberately deferred to Phase 7.
