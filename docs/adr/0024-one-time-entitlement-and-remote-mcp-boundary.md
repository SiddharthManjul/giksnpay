# ADR-0024: One-time entitlement and remote MCP boundary

- Status: Accepted
- Date: 2026-09-04

## Context

MindPay must let a paid agent receive a merchant service without letting the model, browser, MCP
client, or merchant decide that payment succeeded. The fulfilment credential is a bearer token, so
storing or exposing it broadly would turn a database or browser leak into service theft. Remote MCP
also creates a new protocol surface whose tool discovery, inputs, authorization, and host handling
must remain narrower than the underlying application APIs.

## Decision

MindPay issues an ES256 JWT only inside the same D1 batch that commits a captured-and-paid payment
attempt and advances the transaction through `PAYMENT_CAPTURED` to `ENTITLEMENT_ISSUED`. Claims bind
the exact issuer, merchant audience, agent, transaction, merchant, service, amount, currency,
checkout hash, single `service:redeem` scope, `jti`, and a 15-minute lifetime. Canonical business
storage retains only the token hash. A separate supporting delivery row holds A256GCM ciphertext
under the platform key-encryption secret and is deleted after verified delivery.

SignalWorks verifies MindPay's public JWKS, exact claims, expiry, and its own captured-and-paid order
before atomically inserting the one-time redemption and a running fulfilment. A unique entitlement,
token hash, and transaction prevent sequential and concurrent replay. Structured service output is
validated twice at most. A valid output is canonicalized, hashed, and covered by a merchant ES256
delivery receipt. MindPay verifies the receipt key, lifetime, entitlement, transaction, agent,
merchant, service, and output hash before storing an immutable result and marking fulfilment final.

Both `/mcp` endpoints use the official TypeScript MCP SDK through a fresh server factory per HTTP
request. SignalWorks exposes only two redemption tools and status. MindPay exposes only verified
search, service, signed-offer, proposal, transaction-status, and evidence-availability tools. The
MindPay endpoint reuses session and organization authorization, checks the selected published
agent's exact tool binding and commerce scope, rate-limits the session/agent tuple in D1, validates
Host and browser Origin, and appends an immutable invocation record. No MCP tool can create an
order, approve a transaction, execute payment, access arbitrary network or files, or perform raw
database CRUD.

## Consequences

- Payment truth remains exclusively in deterministic Razorpay reconciliation and D1 transitions.
- A replayed, expired, wrong-audience, wrong-service, wrong-agent, or unpaid token cannot run work.
- The canonical entitlement table is safe to use in evidence views without exposing the bearer JWT.
- Delivery failures can be retried idempotently from the merchant's immutable completed fulfilment.
- Evidence bundle assembly remains Phase 9; the MCP tool reports `NOT_YET_CREATED` instead of
  fabricating evidence.
- Key rotation requires overlapping public JWKS entries and retaining old public keys through every
  outstanding entitlement and evidence retention window.

## Rejected alternatives

- Giving the model a payment or raw CRUD MCP tool was rejected because it crosses the authority
  boundary.
- Treating browser callback data as sufficient to issue an entitlement was rejected because it is
  client-controlled evidence.
- Persisting plaintext JWTs in the canonical entitlement table was rejected because a database read
  would become a bearer-token leak.
- Marking fulfilment successful before receipt verification was rejected because merchant output is
  external, untrusted data.
- A singleton MCP server closing over mutable Worker bindings was rejected because concurrent
  requests could mix request-local authority.
