# ADR-0018: Immutable agent versions and encrypted signing keys

- Status: Accepted
- Date: 2026-08-30

## Context

MindPay agents act for an organization but must not become an alternate source of payment or policy
authority. Their exact system policy, model configuration, approved tool bindings, and signing
identity must remain reviewable after publication. Browser clients need the public signing identity
without gaining access to private material.

## Decision

The Gateway owns organization-scoped agent administration in D1. Agent and version requests use
strict shared contracts, authenticated organization capabilities, non-enumerating lookups, and
request-hash-bound idempotency. BUILDER, ADMIN, and OWNER may create or publish; VIEWER and REVIEWER
retain read access according to the shared capability matrix.

Each agent receives one generated ES256 identity at creation. The public JWK is stored and returned
through a public-only response contract. The private JWK is exported only during generation,
immediately encrypted with A256GCM, and stored only as an envelope. Decryption requires a dedicated
32-byte secret supplied at runtime. Authenticated encryption context binds the envelope to the exact
agent ID, key ID, and `mindpay-agent` owner domain, so substitution across agents or keys fails.

Agent versions are drafts until publication. Publishing sets an immutable timestamp and the owning
agent's current-version pointer. D1 triggers reject any later update or delete of the version and
any insert, update, or delete of its tool bindings. Separate pointer triggers allow only a published
version belonging to that agent. This protects the invariant even when application code is bypassed.

## Consequences

- API responses and logs never contain an encrypted or plaintext private JWK.
- Losing the wrapping secret makes stored signing keys unavailable; secret backup and rotation need
  an explicit operational procedure before production.
- Policy, model configuration, and tool-scope changes require a new version rather than mutation.
- Tool execution remains unavailable until the approved registry and runtime tickets are complete.
