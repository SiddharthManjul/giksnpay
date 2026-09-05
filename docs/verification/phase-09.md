# Phase 9 verification: signed audit and public evidence

Date: 2026-09-05

## Exit gate

Successful, blocked, and failed-payment transactions produce complete signed evidence. Audit, merchant
checkout, delivery receipt, bundle, and forbidden-field mutations fail closed. The public artifact
contains only the strict redacted contract and nine explicit proof outcomes.

## Evidence

| Boundary | Verified behavior |
|---|---|
| Audit append | Concurrent appends receive one contiguous sequence each; financial state and its event commit in the same D1 batch |
| Immutability | D1 rejects audit update/delete and evidence update/delete before the indexed retention boundary |
| Coverage | Intent, offer, policy, risk, approval, budget, checkout, Razorpay, entitlement, fulfilment, completion, block, failure, and evidence events are appended at their authoritative transitions |
| Realtime | Transaction Durable Object messages are refresh hints; upgrade authorization rechecks the user, organization membership, active/demo status, and owned transaction |
| Terminal outcomes | ₹299 success, deterministic block, and payment failure each assemble their outcome-specific bundle without fabricating inapplicable payment or delivery proofs |
| Bundle | Exact mandate proof, agent/version/tools, merchant publications/checkout, policy/risk versions, payment, fulfilment, and audit anchors are canonicalized, hashed, ES256-signed, and privately stored |
| Public verifier | Nine schema/hash/signature/audit/merchant/payment/delivery/redaction results are returned with a redacted bundle, its platform signature, per-event audit signatures, and no private R2 address |
| Portable download | The downloaded public response can be verified as a signed envelope against published platform keys without trusting its displayed verdict |
| Tamper tests | Event content, checkout proof, receipt proof, bundle content, hash, signature, leaked credentials, and forbidden public fields are independently mutated and rejected; explicit `[REDACTED]` markers remain valid |
| Corrupt storage | Malformed stored bundle or signature JSON produces failed proof outcomes instead of crashing the public verifier |

## Reproduction

```bash
pnpm verify:phase-09
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The focused verifier runs the audit package tests, reproducible D1 schema suite, portable evidence
mutations, concurrent append test, and the existing ₹299/₹449/₹799 transaction integration with
success, block, and payment-failure evidence assertions.

Architecture decision: `docs/adr/0025-signed-audit-and-public-evidence.md`.
