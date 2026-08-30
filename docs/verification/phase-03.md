# Phase 3 verification

- Date: 2026-08-30
- Result: Pass
- Razorpay credentials required: None

## Merchant boundaries verified

| Boundary | Evidence |
|---|---|
| Separate authority | SignalWorks uses its own D1, machine credential, and purpose-isolated manifest, catalog, checkout, and event keys |
| Public trust artifacts | Exact-origin manifest and immutable three-service catalog validate and verify canonical signatures |
| ACP conformance | Create, update, get, complete, and cancel bodies validate against the pinned `2026-04-17` schemas |
| Authoritative checkout | Stored ACP state and the mandate-bound merchant checkout have detached checkout-key signatures; a one-byte semantic change fails verification |
| State machine | Only `ready_for_payment` may update, complete, or cancel; illegal terminal transitions return `409` without changing persisted state |
| Machine boundary | Bearer credential, `API-Version`, and `Request-Id` are checked before writes; invalid, expired, and revoked credentials fail closed |
| Safe retries | Idempotency is scoped to credential and endpoint, bound to canonical request JSON, replays exact stored output, and rejects changed input |
| Event outbox | Every accepted mutation emits one immutable signed lifecycle event with timestamp, expiry, nonce, state hash, and event-purpose key ID |
| Event verification | MindPay binds events to the expected merchant, accepts valid events, and rejects merchant mismatch, replay, expiry, unknown keys, invalid signatures, and revoked keys while accepting declared rotation overlap |
| Repeatable seed | Independent fresh D1 databases converge on the same public merchant metadata, catalog payload, service versions, and machine-credential metadata |

## Reproducible exit suite

`pnpm verify:phase-03` runs three fail-fast layers:

1. pinned ACP generation drift and official-example conformance;
2. strict merchant, signature, and cross-party contract tests; and
3. the complete SignalWorks migration and Miniflare integration suite.

The SignalWorks layer includes the Gateway-to-merchant contract without any Razorpay environment
variables. It exercises authoritative price replacement, all five ACP operations, exact replay,
payload conflicts, authentication-before-write, signed headers, immutable terminal states, durable
outbox events, replay defense, event-key rotation/revocation, and two independent fresh seeds.
The passing run covers 218 focused cases: 73 pinned ACP checks, 120 strict shared-contract cases,
and 25 SignalWorks migration and integration cases.

## Verified commands

| Command | Result | Proves |
|---|---|---|
| `pnpm verify:phase-03` | Pass | ACP, shared merchant contracts, and focused SignalWorks exit suite |
| `pnpm check` | Pass | Formatting, lint, strict typecheck, and all repository tests |
| `pnpm build` | Pass | All application and package production builds |

## Architecture record

ADR-0013 through ADR-0016 record purpose-isolated merchant keys, exact-origin manifest publication,
immutable catalog versions, signed ACP state, authenticated payload-bound idempotency, and the
replay-protected event outbox.

## Result

The Phase 3 exit gate is satisfied: MindPay verifies the signed manifest and catalog, every ACP
checkout response is schema-valid and signed, retries are safe, changed payloads and signed-state
mutations fail, service versions cannot change in place, lifecycle events are replay protected, and
a clean merchant database can be seeded without Razorpay credentials. Phase 4 may onboard and index
the verified merchant surface.
