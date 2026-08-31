# ADR-0020: Canonical commerce authority and agent-run evidence

- Status: Accepted
- Date: 2026-08-30

## Context

MindPay agents need enough capability to discover verified services and prepare purchases without
turning model output or merchant-controlled text into payment authority. A model can misunderstand
intent, a catalog description can contain prompt injection, and a provider can fail mid-run. The
system must still identify exactly which immutable agent version and tools acted, retain useful
evidence without hidden reasoning, stream progress safely, and offer a non-AI commerce path.

## Decision

Published agent versions bind only six reviewed versioned tools. Four procurement tools carry a
strict category allowlist and maximum price; two future read-only evidence tools carry an empty
scope. Registry construction validates every binding against a discriminated contract. Execution
rejects an unbound ID before invoking its handler, validates input and output, labels all tool output
as untrusted external data, computes canonical hashes, enforces a timeout, and returns only explicit
success, failure, or timeout results. URL fetch, shell, raw database, policy mutation, and payment
execution do not exist in the registry.

The model has two bounded roles: parse the user's procurement intent and produce user-visible
explanatory text. Canonical D1 marketplace rows and their current signed catalog determine eligible
services, merchant identity, price, version, terms, and recipient. Deterministic code filters by the
intent and immutable tool scopes, selects the service, verifies signed-offer consistency, and builds
the proposal. Neither merchant prose nor streamed model text is accepted as an orchestration input.
The proposal is not a transaction or payment instruction.

Each run records its organization, user, agent, exact published version, source, terminal status,
bounded intent and decision summaries, and optional typed proposal. Every tool call records typed
input and output, hashes, version ID, latency, stable error, and terminal status. Run events use an
append-only contiguous sequence and contain only structured state summaries or user-visible model
text. The provider boundary does not request or expose hidden reasoning, and no evidence schema has
a field for it. D1 triggers require the current published organization version and an immutable
bound tool, freeze terminal rows, prevent deletion, and reject event mutation or sequence gaps.
Run creation also requires a request-hash-bound idempotency key. An exact replay returns the stored
response without invoking a model or tool again; changed input under the same scope and key fails.

SSE is a projection of stored events, not a state authority. Clients resume from a sequence ID and
receive a final instruction to refetch the canonical run. Model text events cannot create or advance
a transaction. If the provider is unavailable, the AI run closes explicitly and advertises manual
fallback. Manual selection uses the same scoped service lookup, signed offer, deterministic proposal,
evidence, and organization boundary without invoking a model.

## Consequences

- Adding a tool requires a reviewed contract and registry implementation; a database binding alone
  cannot grant arbitrary execution.
- Price, payee, service, and catalog evidence can be traced to canonical verified state and the exact
  immutable agent version.
- Stored evidence supports audit and UI explanations but intentionally cannot reproduce private
  model reasoning.
- SSE consumers must refetch canonical state after replay rather than treating a text stream as a
  transaction state machine.
- Provider outages reduce AI convenience but do not remove marketplace discovery, manual proposal,
  or evidence retrieval.
- Payment authorization remains deferred to Phase 6 mandate, policy, risk, and approval controls.
