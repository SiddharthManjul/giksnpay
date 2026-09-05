# ADR-0025: Signed audit chains and public evidence

- Status: Accepted
- Date: 2026-09-05

## Context

MindPay controls financial transitions that cross the browser, agent runtime, Gateway, merchant,
Razorpay, and fulfilment service. A conventional mutable activity log cannot prove ordering,
detect a rewritten fact, or produce a safe artifact for a user or third party. The full operational
record also contains material that must not become public, including prompts, credentials, raw
provider payloads, and signatures used at private protocol boundaries.

## Decision

Every transaction appends canonical, redacted audit events in the same D1 batch as the business
mutation. Each event contains a contiguous sequence, the preceding event hash, a hash of the full
source payload, a safe redacted payload, and an ES256 platform signature. D1 triggers make stored
events append-only. A failed or racing audit append aborts its associated financial mutation.

Committed events are also published as non-authoritative refresh hints through a transaction-scoped
Durable Object. D1 remains canonical: reconnecting clients always refetch the transaction and signed
event chain. WebSocket authorization binds the authenticated user, organization membership, active
organization, unexpired demo workspace, and owned transaction before the upgrade.

Terminal `BLOCKED`, `PAYMENT_FAILED`, and successful `FULFILLED` transactions enqueue idempotent
evidence assembly. The bundle binds the exact transaction, mandate proof, agent/version/tools,
merchant manifest/catalog/checkout, policy and risk versions, payment evidence where applicable,
fulfilment receipt where applicable, and complete audit chain. It is canonicalized, hashed, signed,
stored in private R2 as supporting storage, and indexed in D1 as canonical business state. Successful
fulfilment advances to `EVIDENCE_READY` only with the evidence insert.

The public endpoint returns a strict redacted contract, the platform bundle signature, per-event
audit signatures, and nine explicit proof results. It never returns prompts, authorization material,
cookies, secrets, private keys, raw provider payloads, raw webhook bodies, or private R2 URLs. The
download can be checked against published platform keys without trusting the server-rendered verdict.
Portable-envelope tests independently mutate audit, merchant checkout, receipt, bundle, credential,
and forbidden-field families and require fail-closed verification.

## Consequences

- A state transition and its audit fact either commit together or neither commits.
- Duplicate or dropped stream messages cannot become business authority.
- Public verification can distinguish schema, hash, platform signature, audit chain/signatures,
  merchant, payment, delivery, and redaction outcomes.
- Public evidence is intentionally sufficient for verification but not for replaying private payment
  or fulfilment protocols.
- Platform public keys and merchant verification keys must remain available for the full evidence
  retention window.

## Rejected alternatives

- A mutable JSON activity column was rejected because it cannot prove ordering or detect history
  replacement.
- Treating Durable Object state as canonical was rejected because reconnect, eviction, or duplicate
  delivery would change displayed financial truth.
- Publishing the private R2 object was rejected because its storage identity and operational
  metadata are outside the public redaction contract; the safe verification signatures are copied
  into the strict public response instead.
- Letting the model summarize evidence was rejected because model output cannot establish payment,
  policy, receipt, or audit validity.
