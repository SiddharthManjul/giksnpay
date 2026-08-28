# MindPay — Razorpay AI Buildathon Implementation Plan

**Track:** 01 — AI Growth & Agentic Commerce  
**Product:** MindPay  
**Positioning:** Trust layer for autonomous agents  
**Build target:** A production-grade, publicly hosted Buildathon release that makes a verified digital merchant transactable by an AI buyer through Razorpay Test Mode  
**Primary implementer:** Codex  
**Frontend implementation:** Google Antigravity + Codex  
**Architecture decision:** No blockchain in the Buildathon critical path

---

## 0. Instructions to Codex

Treat this document as the single source of truth for the implementation.

1. Implement the phases in order. Do not skip security, verification, idempotency, audit or failure-handling work to reach the UI faster.
2. Use strict TypeScript throughout. Do not use `any` in application code. Validate every external boundary with Zod or a vendored protocol JSON Schema.
3. Keep the AI model outside the payment authority boundary. The model may discover, compare and propose. Deterministic code must verify, approve, create orders, verify signatures, process webhooks and release fulfilment.
4. Do not expose Razorpay secrets, merchant signing keys, platform signing keys, passkey challenges or raw webhook secrets to the browser or the model.
5. Do not fake the Razorpay integration. Use Razorpay Test Mode Orders, Standard Checkout, server-side signature verification and signed webhooks.
6. Do not claim full AP2 certification. Implement the AP2 authorization model and an explicit compatibility layer as described below. Label it `AP2-aligned` until an official TypeScript conformance path is integrated.
7. Pin the Agentic Commerce Protocol implementation to the stable `2026-04-17` snapshot and vendor the relevant OpenAPI and JSON Schema files into the repository.
8. Every money-related state transition must append an audit event. Every event must be hash-linked to the previous event.
9. All mutating endpoints must support idempotency. A repeated key with the same request returns the stored result. A repeated key with a different request returns `409`.
10. Do not leave TODOs, placeholder buttons, fake charts or non-functional critical paths in the submitted product.
11. After every phase:
    - run lint
    - run typecheck
    - run unit and integration tests
    - update `docs/status.md`
    - record architecture changes in `docs/adr/`
12. Only stop for credentials that cannot be generated in code: Razorpay Test Mode keys, webhook secret, OAuth credentials, Cloudflare account bindings and the chosen AI API key.

---

# 1. Product Definition

## 1.1 What MindPay is for this Buildathon

MindPay is a verified agent-commerce gateway where a human or organisation can:

- select or configure a buyer agent
- define a bounded spending mandate
- discover only approved merchants and services
- let the agent compare structured offers
- purchase a digital service through Razorpay Test Mode
- receive the purchased service through a scoped MCP entitlement
- inspect a complete, cryptographically verifiable audit trail

The user remains the owner and final principal. MindPay is the secondary control authority: it can verify, restrict, escalate, revoke or block an action but cannot invent a payment or expand the user’s mandate.

## 1.2 Buildathon alignment

The release must prove all of the following:

- A merchant is readable and transactable by an AI buyer end to end.
- Razorpay Test Mode is used for the actual payment flow.
- Every money action is explainable.
- Every money action is bounded by a user mandate.
- Every money action is gated by deterministic policy.
- A complete audit trail is visible.
- At least one failure is handled gracefully.
- A public repository, architecture documentation, live product and five-minute pitch are ready.

## 1.3 The core product loop

```text
User intent
  ↓
Verified buyer agent
  ↓
Approved merchant discovery
  ↓
Merchant-signed offer
  ↓
User mandate + deterministic policy
  ↓
Razorpay Test Mode order and checkout
  ↓
Callback verification + signed webhook reconciliation
  ↓
Scoped entitlement
  ↓
Merchant MCP service fulfilment
  ↓
Signed evidence bundle and public verifier
```

## 1.4 Buildathon release boundaries

This is a complete product for verified digital-service commerce. It is not a low-fidelity mock.

The following are intentionally outside the Buildathon release:

- blockchain settlement or audit anchoring
- x402, MPP or a live NPCI UAP integration
- real-money Razorpay Live Mode
- arbitrary user-uploaded containers or untrusted code execution
- platform custody of user funds
- automatic card or UPI charging without payment-rail authentication
- marketplace payouts and multi-merchant settlement
- raw card-data handling
- unrestricted agent access to the open internet or arbitrary MCP servers

The codebase must nevertheless expose clean interfaces for future payment rails, authorization protocols and commerce protocols.

---

# 2. Primary Demonstration

## 2.1 Demo merchant

Create a separately deployed reference merchant named **SignalWorks**.

SignalWorks sells three digital services:

| Service | Price | Behaviour |
|---|---:|---|
| Market Snapshot | ₹299 | Below the default auto-approval threshold |
| Detailed Competitor Dossier | ₹449 | Requires explicit user approval |
| Enterprise Intelligence Pack | ₹799 | Exceeds the default per-transaction mandate and must be blocked |

SignalWorks must expose:

- a signed merchant manifest
- an agent-readable structured catalog
- ACP checkout endpoints
- a Razorpay Test Mode integration
- a remote MCP fulfilment tool
- signed merchant order and delivery events

## 2.2 Default buyer agent

Create **MindPay Procurement Agent** with:

- category: business research
- approved tools only
- no direct network access
- no Razorpay secret access
- no direct payment tool
- ability to search, compare and propose purchases
- ability to redeem an entitlement after confirmed payment

## 2.3 Default mandate

```text
Currency: INR
Allowed merchant: SignalWorks
Allowed category: business research
Per-transaction maximum: ₹500
Total budget: ₹1,000
Automatic approval threshold: ₹350
Allowed rail: Razorpay Test Mode
Maximum payment attempts per transaction: 2
Expiry: 24 hours
```

## 2.4 Successful demo

1. Judge opens the live application and launches a demo workspace.
2. Judge inspects or creates the default mandate.
3. Judge asks: “Buy the best competitor research report under ₹400.”
4. Agent searches the verified catalog.
5. Agent compares the three services and selects Market Snapshot at ₹299.
6. MindPay verifies the merchant, catalog version, signed offer, mandate, budget and risk rules.
7. MindPay creates a checkout session and the merchant creates a Razorpay Test Mode order.
8. Razorpay Standard Checkout opens.
9. Judge completes the payment using a Razorpay Test Mode success method.
10. Merchant verifies the checkout callback.
11. Merchant receives and verifies the Razorpay webhook.
12. MindPay receives the signed merchant event and reconciles payment state.
13. MindPay issues a one-time entitlement.
14. The agent invokes the SignalWorks MCP fulfilment tool with the entitlement.
15. SignalWorks returns the report.
16. MindPay stores the result, closes the transaction and produces the signed evidence bundle.
17. Judge opens the audit timeline and public evidence verifier.

## 2.5 Mandatory failure demonstrations

### Failure A: policy block before payment

Prompt:

> “Buy the Enterprise Intelligence Pack for ₹799.”

Expected result:

- no Razorpay order is created
- no budget is consumed
- transaction state becomes `BLOCKED`
- UI explains the violated rule
- audit trail records the exact policy decision

### Failure B: payment failure

Use Razorpay’s Test Mode failure path.

Expected result:

- payment becomes `PAYMENT_FAILED`
- no entitlement is issued
- no service is fulfilled
- reserved budget is released
- retry is offered within the attempt limit
- failure and retry decision are audited

### Failure C: tampered offer

Provide an internal adversarial test that changes ₹299 to ₹2,999 or changes the merchant key after the offer is signed.

Expected result:

- signature or amount reconciliation fails
- order creation is blocked
- merchant is temporarily quarantined if configured
- audit timeline records `OFFER_INTEGRITY_FAILED`

---

# 3. System Architecture

## 3.1 Deployable applications

```text
┌─────────────────────────────────────────────────────────────────┐
│ MindPay Web — Next.js                                           │
│ Trusted user surface, passkeys, marketplace, agent workspace,   │
│ checkout launcher, transaction timeline, evidence verifier       │
└───────────────────────┬─────────────────────────────────────────┘
                        │ HTTPS / authenticated API
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ MindPay Gateway — Cloudflare Worker + Hono                      │
│ Auth, organisations, agent registry, marketplace, verification, │
│ policy, risk, mandates, orchestration, audit, MCP server         │
├─────────────────────────────────────────────────────────────────┤
│ D1 · R2 · KV · Queues · Durable Objects                         │
└───────────────────────┬─────────────────────────────────────────┘
                        │ signed ACP requests / signed events
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ SignalWorks Merchant — separate Cloudflare Worker + Hono        │
│ Manifest, catalog, ACP checkout, Razorpay adapter, webhook       │
│ receiver, entitlement verifier, MCP fulfilment server            │
├─────────────────────────────────────────────────────────────────┤
│ Merchant D1 · Merchant Queue · private R2 evidence               │
└───────────────────────┬─────────────────────────────────────────┘
                        │ Razorpay Test Mode APIs / Checkout
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ Razorpay Test Mode                                               │
│ Orders, Standard Checkout, payment status, webhooks, refunds     │
└─────────────────────────────────────────────────────────────────┘
```

## 3.2 Security boundaries

### Trusted Surface

The browser UI is the trusted surface for:

- displaying the exact mandate
- registering and invoking passkeys
- showing step-up approval
- launching Razorpay Checkout
- presenting the final evidence

The LLM cannot access passkey credentials or approval challenges.

### Agent Runtime

The agent runtime may:

- search approved services
- request signed offers
- compare options
- propose a purchase
- request transaction status
- redeem a paid entitlement

The agent runtime may not:

- choose arbitrary URLs
- choose a payment recipient from text
- call Razorpay directly
- access payment secrets
- change a policy
- increase a budget
- approve its own exception
- issue an entitlement
- mark a payment captured

### Merchant

The merchant owns:

- catalog truth
- checkout truth
- Razorpay Test Mode credentials
- payment signature verification
- Razorpay webhook verification
- fulfilment
- merchant-signed receipts

### MindPay

MindPay owns:

- agent identity and version
- merchant verification status
- user mandate
- policy and risk decisions
- orchestration
- cross-party evidence and audit

MindPay does not store card details or raw payment credentials.

---

# 4. Technology Stack

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Language | TypeScript with `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` |
| Frontend | Next.js App Router, React, Tailwind, shadcn/ui |
| Frontend data | TanStack Query |
| Local UI state | Zustand only where URL/server state is inappropriate |
| Forms | React Hook Form + Zod |
| Visual workflow/timeline | `@xyflow/react` only for the visual transaction graph |
| Web deployment | Cloudflare Workers through `@opennextjs/cloudflare` |
| APIs | Hono + `@hono/zod-openapi` |
| Database | Cloudflare D1 + Drizzle ORM |
| Object storage | Cloudflare R2 |
| Fast public catalog cache | Cloudflare KV |
| Async events | Cloudflare Queues |
| Real-time transaction feed | Durable Object with WebSocket hibernation |
| Authentication | Better Auth |
| Passkeys | SimpleWebAuthn or Better Auth passkey support |
| AI runtime | Vercel AI SDK with provider abstraction |
| MCP | Official MCP TypeScript SDK or Cloudflare Agents SDK |
| Razorpay | Direct REST calls through `fetch`, not an unrestricted model tool |
| Crypto | Web Crypto API: SHA-256, HMAC-SHA256, AES-GCM and ECDSA P-256 |
| Canonical JSON | RFC 8785-compatible JSON canonicalization |
| Unit tests | Vitest |
| API mocking | MSW |
| Property tests | fast-check |
| End-to-end | Playwright |
| Formatting/lint | Biome |
| CI/CD | GitHub Actions + Cloudflare deployment |
| Abuse protection | Cloudflare Turnstile + application rate limits |

Use direct `fetch` for Razorpay because it keeps the Worker integration small and makes request signing, retries and observability explicit.

---

# 5. Repository Structure

```text
mindpay/
├── AGENTS.md
├── README.md
├── pnpm-workspace.yaml
├── turbo.json
├── biome.json
├── apps/
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── lib/
│   │   └── tests/
│   ├── gateway/
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── middleware/
│   │   │   ├── durable-objects/
│   │   │   ├── queue/
│   │   │   └── index.ts
│   │   └── wrangler.jsonc
│   └── merchant-signalworks/
│       ├── src/
│       │   ├── acp/
│       │   ├── catalog/
│       │   ├── mcp/
│       │   ├── payments/
│       │   ├── webhooks/
│       │   ├── fulfilment/
│       │   └── index.ts
│       └── wrangler.jsonc
├── packages/
│   ├── contracts/
│   ├── domain/
│   ├── db/
│   ├── crypto/
│   ├── audit/
│   ├── policy-engine/
│   ├── risk-engine/
│   ├── protocol-acp/
│   ├── protocol-mandates/
│   ├── razorpay/
│   ├── agent-runtime/
│   ├── mcp-tools/
│   ├── observability/
│   ├── config/
│   └── ui/
├── protocol/
│   ├── acp/2026-04-17/
│   └── mandate-mapping/
├── fixtures/
│   ├── catalogs/
│   ├── razorpay/
│   ├── webhooks/
│   ├── adversarial/
│   └── evals/
├── tests/
│   ├── contract/
│   ├── integration/
│   ├── e2e/
│   ├── security/
│   └── load/
├── docs/
│   ├── implementation-plan.md
│   ├── status.md
│   ├── architecture.md
│   ├── threat-model.md
│   ├── audit-model.md
│   ├── demo-script.md
│   ├── pitch.md
│   ├── api.md
│   └── adr/
└── .github/
    └── workflows/
```

---

# 6. Domain Rules

1. Use ULIDs for internal IDs.
2. Store all money as integer currency subunits. For INR, store paise.
3. Store timestamps in UTC.
4. Published agent, merchant and service versions are immutable.
5. Never use a product name, merchant name or currency symbol as an authorization identifier.
6. Every signed object includes:
   - schema version
   - issuer
   - audience
   - key ID
   - issued-at
   - expiry
   - nonce or `jti`
7. Every external request includes a request ID.
8. Every write includes an idempotency key.
9. Sensitive payloads go to private R2. D1 stores metadata and hashes.
10. Audit payloads must be redacted and canonicalized before hashing.
11. Payment state is derived from verified Razorpay evidence, not model output or browser text.
12. Fulfilment cannot begin until payment is reconciled as captured and the order is paid.

---

# 7. Data Model

## 7.1 Identity and tenancy

### `organizations`

- `id`
- `name`
- `slug`
- `status`
- `created_at`
- `updated_at`

### `organization_members`

- `organization_id`
- `user_id`
- `role`: `OWNER | ADMIN | BUILDER | REVIEWER | VIEWER`
- `created_at`

Better Auth owns its required user, account, session and verification tables.

## 7.2 Agents

### `agents`

- `id`
- `organization_id`
- `name`
- `slug`
- `description`
- `status`
- `current_version_id`
- `created_by`
- `created_at`

### `agent_versions`

- `id`
- `agent_id`
- `version`
- `model_provider`
- `model_name`
- `system_policy`
- `system_policy_hash`
- `specialization`
- `configuration_json`
- `verification_status`
- `published_at`
- `created_at`

### `agent_keys`

- `id`
- `agent_id`
- `kid`
- `public_jwk`
- `encrypted_private_jwk`
- `valid_from`
- `revoked_at`

### `agent_version_tools`

- `agent_version_id`
- `tool_version_id`
- `scope_json`

## 7.3 Tools and services

### `tools`

- `id`
- `publisher_merchant_id`
- `name`
- `slug`
- `type`: `INTERNAL | MCP | REST`
- `status`

### `tool_versions`

- `id`
- `tool_id`
- `version`
- `endpoint`
- `manifest_hash`
- `input_schema_json`
- `output_schema_json`
- `permissions_json`
- `published_at`

### `services`

- `id`
- `merchant_id`
- `external_id`
- `name`
- `description`
- `category`
- `status`
- `current_version_id`

### `service_versions`

- `id`
- `service_id`
- `version`
- `price_subunits`
- `currency`
- `availability`
- `fulfilment_tool_id`
- `catalog_hash`
- `published_at`

## 7.4 Merchant verification

### `merchants`

- `id`
- `name`
- `slug`
- `legal_name`
- `domain`
- `status`
- `risk_tier`
- `current_manifest_id`
- `created_at`

### `merchant_keys`

- `id`
- `merchant_id`
- `kid`
- `public_jwk`
- `purpose`: `MANIFEST | CHECKOUT | EVENT`
- `valid_from`
- `revoked_at`

### `merchant_manifests`

- `id`
- `merchant_id`
- `version`
- `manifest_json`
- `manifest_hash`
- `signature`
- `verified_at`
- `expires_at`

### `merchant_verifications`

- `id`
- `merchant_id`
- `check_type`
- `status`
- `evidence_json`
- `checked_at`
- `expires_at`

## 7.5 Mandates and spend control

### `mandates`

- `id`
- `organization_id`
- `user_id`
- `agent_id`
- `status`
- `currency`
- `max_transaction_subunits`
- `budget_subunits`
- `approval_threshold_subunits`
- `spent_subunits`
- `reserved_subunits`
- `allowed_rails_json`
- `allowed_merchants_json`
- `allowed_categories_json`
- `allowed_services_json`
- `max_attempts`
- `starts_at`
- `expires_at`
- `nonce`
- `schema_version`
- `created_at`

### `mandate_proofs`

- `id`
- `mandate_id`
- `proof_type`: `WEBAUTHN_ASSERTION | PLATFORM_JWS | AGENT_JWS`
- `payload_hash`
- `proof_json`
- `verified_at`

### `spend_reservations`

- `id`
- `mandate_id`
- `transaction_id`
- `amount_subunits`
- `status`: `RESERVED | COMMITTED | RELEASED | EXPIRED`
- `expires_at`
- `created_at`

Reserve budget atomically before creating a Razorpay order:

```sql
UPDATE mandates
SET reserved_subunits = reserved_subunits + ?
WHERE id = ?
  AND status = 'ACTIVE'
  AND expires_at > CURRENT_TIMESTAMP
  AND spent_subunits + reserved_subunits + ? <= budget_subunits;
```

Proceed only when one row changes.

## 7.6 Commerce and payments

### `checkout_sessions`

- `id`
- `merchant_id`
- `agent_id`
- `mandate_id`
- `merchant_checkout_id`
- `status`
- `currency`
- `total_subunits`
- `checkout_payload_hash`
- `merchant_checkout_jwt`
- `expires_at`
- `created_at`

### `offers`

- `id`
- `checkout_session_id`
- `merchant_id`
- `service_version_id`
- `amount_subunits`
- `currency`
- `offer_payload`
- `offer_hash`
- `signature`
- `kid`
- `expires_at`
- `verified_at`

### `transactions`

- `id`
- `organization_id`
- `user_id`
- `agent_id`
- `agent_version_id`
- `merchant_id`
- `service_version_id`
- `mandate_id`
- `checkout_session_id`
- `state`
- `risk_decision`
- `risk_score`
- `policy_decision_json`
- `amount_subunits`
- `currency`
- `request_id`
- `created_at`
- `updated_at`

### `payment_orders`

- `id`
- `transaction_id`
- `provider`: `RAZORPAY`
- `provider_order_id`
- `provider_payment_id`
- `receipt`
- `amount_subunits`
- `currency`
- `status`
- `callback_signature_verified_at`
- `captured_at`
- `created_at`

### `webhook_events`

- `id`
- `provider`
- `provider_event_id`
- `event_type`
- `payload_hash`
- `raw_payload_r2_key`
- `signature_verified`
- `processing_status`
- `received_at`
- `processed_at`

Create a unique index on `(provider, provider_event_id)`.

### `entitlements`

- `id`
- `transaction_id`
- `agent_id`
- `merchant_id`
- `service_id`
- `token_hash`
- `scopes_json`
- `status`: `ACTIVE | CONSUMED | EXPIRED | REVOKED`
- `expires_at`
- `consumed_at`

## 7.7 Agent execution and evidence

### `agent_runs`

- `id`
- `agent_version_id`
- `user_id`
- `transaction_id`
- `status`
- `intent_summary`
- `decision_summary`
- `started_at`
- `completed_at`

### `tool_calls`

- `id`
- `agent_run_id`
- `tool_version_id`
- `input_hash`
- `output_hash`
- `status`
- `latency_ms`
- `created_at`

### `audit_events`

- `id`
- `transaction_id`
- `sequence`
- `event_type`
- `actor_type`
- `actor_id`
- `payload_json`
- `payload_hash`
- `previous_event_hash`
- `event_hash`
- `signature`
- `kid`
- `created_at`

Unique index on `(transaction_id, sequence)`.

Add database triggers that reject `UPDATE` and `DELETE` on `audit_events`.

### `evidence_bundles`

- `id`
- `transaction_id`
- `schema_version`
- `bundle_hash`
- `r2_key`
- `signature`
- `kid`
- `created_at`

### `idempotency_records`

- `scope`
- `key`
- `request_hash`
- `response_status`
- `response_body`
- `state`
- `expires_at`
- `created_at`

Unique index on `(scope, key)`.

---

# 8. State Machines

## 8.1 Transaction state

```text
DRAFT
  → DISCOVERING
  → OFFER_SELECTED
  → VERIFYING
  → POLICY_REVIEW
      → BLOCKED
      → APPROVAL_REQUIRED
      → APPROVED
  → BUDGET_RESERVED
  → CHECKOUT_CREATED
  → ORDER_CREATED
  → PAYMENT_PENDING
      → PAYMENT_FAILED
      → CALLBACK_VERIFIED
  → PAYMENT_RECONCILING
  → PAYMENT_CAPTURED
  → ENTITLEMENT_ISSUED
  → FULFILLING
      → FULFILMENT_FAILED
  → FULFILLED
  → EVIDENCE_READY
```

A verified provider update may move `PAYMENT_FAILED` back to
`PAYMENT_RECONCILING` and then `PAYMENT_CAPTURED`, because payment-provider
events can be delayed or arrive after an initial failure state.

Additional terminal or recovery states:

- `EXPIRED`
- `CANCELLED`
- `REFUND_PENDING`
- `REFUNDED`
- `DISPUTED`

Every transition must be validated against an explicit transition table. Reject illegal transitions with `409`.

## 8.2 Mandate state

```text
DRAFT → ACTIVE
ACTIVE → SUSPENDED | EXHAUSTED | EXPIRED | REVOKED
SUSPENDED → ACTIVE | REVOKED
```

## 8.3 Merchant verification state

```text
SUBMITTED
  → DOMAIN_VERIFIED
  → KEY_VERIFIED
  → CATALOG_VALIDATED
  → PAYMENT_CONFIGURATION_VERIFIED
  → APPROVED
```

Any material manifest, key, domain, endpoint or catalog-signing change moves the merchant to `REVIEW_REQUIRED`.

---

# 9. Protocol Implementation

## 9.1 ACP

Pin the implementation to the stable ACP snapshot dated `2026-04-17`.

Vendor:

- OpenAPI specification
- JSON Schemas
- representative official examples

Implement the merchant endpoints:

```text
POST /checkout_sessions
POST /checkout_sessions/:checkout_session_id
GET  /checkout_sessions/:checkout_session_id
POST /checkout_sessions/:checkout_session_id/complete
POST /checkout_sessions/:checkout_session_id/cancel
```

Common requirements:

- HTTPS
- JSON
- bearer authentication for machine callers
- `API-Version`
- `Idempotency-Key`
- `Request-Id`
- complete authoritative checkout state in responses
- safe retries
- exact JSON Schema validation
- signed merchant checkout payload
- outbound signed order lifecycle events

Expose a structured catalog at:

```text
GET /catalog/feed.json
```

The catalog must include current price, availability, seller identity, service version, fulfilment type and policy links.

## 9.2 AP2-aligned MindPay mandates

Implement the AP2 role and mandate model without claiming full external conformance.

### Open Checkout Mandate

The user authorises constraints before a final service is selected:

- user
- agent public key
- allowed merchants
- allowed categories
- allowed services
- line-item constraints
- issued-at
- expiry
- nonce

### Open Payment Mandate

- user
- agent public key
- INR currency
- maximum transaction
- total budget
- allowed payees
- allowed rail
- approval threshold
- recurrence/attempt constraints
- issued-at
- expiry
- nonce

### Merchant-signed checkout

SignalWorks signs the final checkout as an ES256 JWT containing:

- merchant identity
- checkout session ID
- line items
- amount
- currency
- service version
- fulfilment terms
- expiry
- nonce

### Closed mandates

The agent signs:

- closed checkout mandate bound to the merchant checkout hash
- closed payment mandate bound to the same checkout hash, amount, payee and rail

MindPay deterministically verifies that closed mandates conform to the user-authorised open mandates.

### Trusted user approval

Use WebAuthn/passkeys to approve the canonical hash of the open mandate or the closed mandate during step-up approval.

Store:

- challenge
- public credential
- authenticator data
- client data
- signature
- verification result
- signed payload hash

### Compatibility label

Use MindPay version identifiers such as:

```text
mindpay.mandate.checkout.open.1
mindpay.mandate.payment.open.1
mindpay.mandate.checkout.closed.1
mindpay.mandate.payment.closed.1
```

Create `packages/protocol-mandates/ap2-mapping.ts` that maps fields to current AP2 concepts. Do not expose `mandate.checkout.1` or claim SD-JWT compliance until selective-disclosure credentials are implemented and tested.

## 9.3 MCP

### MindPay remote MCP tools

Expose a remote MCP endpoint at `/mcp` with narrowly scoped tools:

1. `search_verified_services`
2. `get_verified_service`
3. `request_signed_offer`
4. `propose_purchase`
5. `get_transaction_status`
6. `get_evidence_bundle`

Do not expose raw database CRUD or direct payment execution.

### SignalWorks MCP tools

1. `redeem_market_snapshot`
2. `redeem_competitor_dossier`
3. `get_fulfilment_status`

Each fulfilment call requires a one-time MindPay entitlement JWT containing:

- issuer
- audience
- transaction ID
- agent ID
- merchant ID
- service ID
- scopes
- expiry
- `jti`

The merchant validates the signature, verifies the transaction reference, atomically consumes the entitlement and refuses replay.

---

# 10. Agent Runtime

## 10.1 Model abstraction

Define:

```ts
interface ModelProvider {
  streamAgentRun(input: AgentRunInput): Promise<AgentRunStream>;
  generateStructured<TSchema>(
    input: StructuredGenerationInput<TSchema>
  ): Promise<StructuredGenerationResult<TSchema>>;
}
```

Implement one real provider. Keep the provider configurable through environment variables.

## 10.2 Agent tools

The model receives only typed, approved tools. Tool output must be labelled as untrusted external data.

The model cannot receive:

- merchant private keys
- Razorpay keys
- payment-recipient overrides
- policy mutation tools
- raw database queries
- arbitrary URL fetch
- shell access
- unrestricted MCP discovery

## 10.3 Agent execution sequence

1. Parse the user’s purchase intent into a structured request.
2. Validate that the request concerns an allowed service category.
3. Search the verified marketplace.
4. Request current signed offers.
5. Compare offers using price, verification tier, fulfilment and user constraints.
6. Produce a concise decision explanation.
7. Call `propose_purchase`.
8. Pause if policy returns `APPROVAL_REQUIRED`.
9. After approval, allow deterministic orchestration to create the checkout and payment order.
10. Wait for confirmed payment state.
11. Redeem the entitlement.
12. Return the purchased result and evidence link.

Store concise decision summaries, tool inputs and tool outputs. Do not store or display hidden model reasoning.

## 10.4 AI fallback

If the AI provider is unavailable:

- marketplace browsing remains functional
- the user can manually select a service
- deterministic verification, Razorpay checkout, fulfilment and evidence still work

The product must not become unusable because the model provider is temporarily unavailable.

---

# 11. Merchant Verification

## 11.1 Well-known manifest

SignalWorks exposes:

```text
GET /.well-known/mindpay.json
```

Example fields:

```json
{
  "schema_version": "1",
  "merchant_id": "merchant_signalworks",
  "name": "SignalWorks",
  "domain": "merchant-demo.example.com",
  "catalog_url": "https://merchant-demo.example.com/catalog/feed.json",
  "acp_base_url": "https://merchant-demo.example.com",
  "mcp_url": "https://merchant-demo.example.com/mcp",
  "signing_keys": [
    {
      "kid": "sig-2026-01",
      "purpose": ["manifest", "checkout", "event"],
      "public_jwk": {}
    }
  ],
  "payment_rails": ["razorpay:test"],
  "expires_at": "..."
}
```

The manifest is canonicalized and signed by the merchant.

## 11.2 Verification checks

MindPay verifies:

- HTTPS only
- exact domain match
- no private IP or arbitrary redirect
- valid schema
- valid signature
- active non-revoked key
- manifest not expired
- catalog endpoint on an approved origin
- ACP schema conformance
- stable service IDs
- valid integer INR prices
- fulfilment tool exists
- payment rail is approved
- merchant key has not changed unexpectedly

## 11.3 Continuous checks

Re-run verification when:

- manifest version changes
- public key changes
- domain changes
- catalog hash changes
- endpoint changes
- merchant event signature fails
- repeated fulfilment failures occur

Automatic action:

- safe catalog change: re-index
- material key/domain/payment change: `REVIEW_REQUIRED`
- signature failure: quarantine
- confirmed compromise: revoke

---

# 12. Deterministic Policy Engine

## 12.1 Input

```ts
type PolicyInput = {
  userId: string;
  organizationId: string;
  agentId: string;
  agentVersionId: string;
  mandate: Mandate;
  merchant: VerifiedMerchant;
  service: ServiceVersion;
  offer: VerifiedOffer;
  transactionContext: TransactionContext;
};
```

## 12.2 Checks

Run in this order:

1. mandate exists
2. mandate is active
3. mandate has not expired
4. agent and version match mandate
5. merchant is approved
6. merchant is in allowlist
7. category is allowed
8. service is allowed, if service restrictions exist
9. offer signature is valid
10. offer has not expired
11. offer amount matches catalog/checkout
12. currency is INR
13. payment rail is Razorpay Test Mode
14. amount is within per-transaction maximum
15. total spend plus reserved amount remains within budget
16. attempt count remains within limit
17. nonce has not been consumed
18. idempotency key has not been used with different input
19. risk decision is not `BLOCK`
20. amount is below automatic threshold or user approval is present

## 12.3 Output

```ts
type PolicyDecision =
  | {
      decision: "ALLOW";
      reasons: PolicyReason[];
      reservationAmount: number;
    }
  | {
      decision: "REQUIRE_APPROVAL";
      reasons: PolicyReason[];
      approvalChallenge: string;
    }
  | {
      decision: "BLOCK";
      reasons: PolicyReason[];
    };
```

The LLM may generate a plain-language explanation from this object, but it may not alter the decision.

---

# 13. Risk Engine

Use deterministic rules as the security boundary. An optional model classifier may add a signal but cannot override a deterministic block.

## 13.1 Blocking rules

- merchant not approved
- invalid merchant signature
- unknown merchant key
- checkout hash mismatch
- amount mismatch
- currency mismatch
- payee mismatch
- expired offer
- replayed nonce
- duplicated logical transaction
- unapproved tool
- service version changed after selection
- payment rail not allowed
- transaction exceeds mandate
- merchant endpoint changed during checkout
- entitlement replay
- malformed Razorpay callback
- invalid Razorpay webhook signature

## 13.2 Review rules

- amount above automatic threshold
- first purchase from a newly approved merchant
- unusual increase over the user’s prior median
- repeated payment failures
- service fulfilment has degraded
- merchant catalog changed recently

## 13.3 Risk output

```ts
type RiskDecision = {
  outcome: "ALLOW" | "REVIEW" | "BLOCK";
  score: number;
  reasons: Array<{
    code: string;
    severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    evidence: Record<string, unknown>;
  }>;
  rulesetVersion: string;
};
```

---

# 14. Razorpay Integration

## 14.1 Ownership

SignalWorks owns the Razorpay Test Mode credentials and creates the order. MindPay never receives the merchant key secret.

## 14.2 Order creation

Create a Razorpay order only after:

- merchant checkout is signed and verified
- closed mandates are verified
- policy allows or user approval is complete
- spend is reserved
- idempotency passes

Order requirements:

- amount in paise
- currency `INR`
- unique receipt
- notes that link MindPay transaction, agent, mandate and service
- server-side creation only

Example notes:

```json
{
  "mindpay_transaction_id": "ctx_...",
  "agent_id": "agt_...",
  "mandate_id": "mnd_...",
  "service_id": "svc_...",
  "checkout_hash": "..."
}
```

## 14.3 Standard Checkout

The web app receives only:

- Razorpay Test Mode Key ID
- Razorpay order ID
- amount
- currency
- display name
- description
- prefill data where appropriate

Never send the key secret to the browser.

## 14.4 Browser callback

The browser posts these values to SignalWorks:

- `razorpay_order_id`
- `razorpay_payment_id`
- `razorpay_signature`
- MindPay transaction ID

SignalWorks:

1. loads the stored order ID
2. computes HMAC-SHA256 over `stored_order_id + "|" + payment_id`
3. compares signatures in constant time
4. marks callback evidence verified
5. does not fulfil yet
6. returns a pending/reconciling response

## 14.5 Webhook endpoint

```text
POST /webhooks/razorpay
```

Processing:

1. read the raw body before JSON parsing
2. read `X-Razorpay-Signature`
3. verify HMAC-SHA256 with the webhook secret
4. read `x-razorpay-event-id`
5. atomically insert the event ID
6. if duplicate, return `204`
7. store the raw payload in private R2
8. enqueue a reference
9. return `204` quickly

The queue consumer:

- parses the event
- handles out-of-order delivery
- fetches the current Razorpay order/payment if needed
- transitions local state through the legal state machine
- sends a signed merchant event to MindPay

Subscribe at minimum to:

- `payment.captured`
- `payment.failed`
- `order.paid`
- refund events if refund support is enabled

## 14.6 Reconciliation rule

Fulfil only when:

- Razorpay payment is captured, and
- Razorpay order is paid, and
- amount, currency and order IDs match the signed checkout

A valid browser callback is useful immediate evidence but is not required for
fulfilment if a verified webhook or server-side Razorpay fetch proves the
captured/paid state. If the callback succeeds but the webhook is delayed,
poll/fetch the Razorpay order and payment from the server. If the callback is
lost but the signed webhook confirms payment, continue safely. Never trust the
browser as the sole source of truth.

## 14.7 Razorpay MCP

Add an optional feature flag:

```text
RAZORPAY_MCP_READONLY_ENABLED=false
```

When enabled, use Razorpay’s hosted MCP only for read-oriented merchant operations such as order or payment status inspection. Do not make the Buildathon critical path depend on MCP OAuth or expose mutating Razorpay MCP tools directly to the model.

---

# 15. Fulfilment and Entitlements

## 15.1 Entitlement issue

After payment capture and order reconciliation, MindPay signs a one-time entitlement.

```json
{
  "iss": "https://api.mindpay.example",
  "aud": "https://merchant-signalworks.example",
  "sub": "agent_...",
  "transaction_id": "ctx_...",
  "merchant_id": "merchant_signalworks",
  "service_id": "market_snapshot",
  "scope": ["service:redeem"],
  "jti": "ent_...",
  "iat": 0,
  "exp": 0
}
```

## 15.2 Redemption

SignalWorks:

1. verifies issuer and signature
2. verifies audience
3. verifies expiry
4. verifies agent, transaction, merchant and service
5. atomically marks `jti` consumed
6. rejects reuse
7. runs fulfilment
8. validates the output schema
9. signs a delivery receipt
10. sends the result and receipt to MindPay

## 15.3 Service output

Market Snapshot output schema:

```ts
type MarketSnapshot = {
  subject: string;
  summary: string;
  competitors: Array<{
    name: string;
    positioning: string;
    strengths: string[];
    weaknesses: string[];
  }>;
  opportunities: string[];
  caveats: string[];
  generatedAt: string;
};
```

The service may use the configured AI provider, but it must validate structured output and retry once on schema failure.

---

# 16. Audit and Evidence

## 16.1 Audit event function

Create one shared function:

```ts
appendAuditEvent(input: {
  transactionId: string;
  eventType: AuditEventType;
  actor: AuditActor;
  payload: Record<string, unknown>;
}): Promise<AuditEvent>
```

Algorithm:

1. redact secrets and unnecessary PII
2. canonicalize payload
3. hash payload
4. load previous event hash and next sequence
5. compute:

```text
event_hash =
SHA256(
  schema_version
  + transaction_id
  + sequence
  + event_type
  + actor_type
  + actor_id
  + payload_hash
  + previous_event_hash
  + timestamp
)
```

6. sign `event_hash` with the MindPay platform signing key
7. insert event
8. broadcast the event to the transaction Durable Object

## 16.2 Required event types

- `USER_INTENT_RECEIVED`
- `AGENT_RUN_STARTED`
- `MARKETPLACE_SEARCHED`
- `MERCHANT_VERIFIED`
- `OFFER_RECEIVED`
- `OFFER_VERIFIED`
- `OFFER_INTEGRITY_FAILED`
- `POLICY_EVALUATED`
- `RISK_EVALUATED`
- `USER_APPROVAL_REQUESTED`
- `USER_APPROVAL_VERIFIED`
- `BUDGET_RESERVED`
- `CHECKOUT_CREATED`
- `RAZORPAY_ORDER_CREATED`
- `RAZORPAY_CALLBACK_VERIFIED`
- `RAZORPAY_WEBHOOK_VERIFIED`
- `PAYMENT_FAILED`
- `PAYMENT_CAPTURED`
- `ENTITLEMENT_ISSUED`
- `ENTITLEMENT_REDEEMED`
- `FULFILMENT_COMPLETED`
- `BUDGET_COMMITTED`
- `BUDGET_RELEASED`
- `EVIDENCE_BUNDLE_CREATED`
- `TRANSACTION_BLOCKED`
- `TRANSACTION_COMPLETED`

## 16.3 Final evidence bundle

```json
{
  "schema_version": "mindpay.evidence.1",
  "transaction": {},
  "user_mandate": {
    "payload_hash": "...",
    "webauthn_proof": {}
  },
  "agent": {
    "id": "...",
    "version": "...",
    "system_policy_hash": "...",
    "tool_versions": []
  },
  "merchant": {
    "id": "...",
    "manifest_hash": "...",
    "catalog_hash": "...",
    "checkout_hash": "...",
    "offer_signature_verified": true
  },
  "policy": {
    "decision": "ALLOW",
    "ruleset_version": "...",
    "reasons": []
  },
  "risk": {
    "outcome": "ALLOW",
    "ruleset_version": "...",
    "reasons": []
  },
  "payment": {
    "provider": "RAZORPAY",
    "mode": "TEST",
    "order_id": "...",
    "payment_id": "...",
    "callback_signature_verified": true,
    "webhook_signature_verified": true,
    "captured": true
  },
  "fulfilment": {
    "entitlement_id": "...",
    "entitlement_consumed": true,
    "output_hash": "...",
    "merchant_receipt_signature_verified": true
  },
  "audit": {
    "event_count": 0,
    "root_event_hash": "...",
    "final_event_hash": "..."
  },
  "created_at": "..."
}
```

Canonicalize, hash and sign the bundle. Store it in private R2 and expose a redacted downloadable version.

## 16.4 Public verifier

Route:

```text
/verify/:evidence_id
```

The verifier:

- loads the evidence bundle
- recomputes canonical hash
- verifies MindPay signature
- verifies each audit hash link
- verifies merchant checkout and delivery signatures
- displays pass/fail for every proof
- does not expose sensitive prompts, PII or raw payment details

---

# 17. API Surface

## 17.1 MindPay Gateway

### Auth and organisation

```text
/api/auth/*
GET  /api/v1/me
GET  /api/v1/organizations/current
```

### Marketplace

```text
GET  /api/v1/marketplace/services
GET  /api/v1/marketplace/services/:serviceId
GET  /api/v1/marketplace/merchants/:merchantId
```

### Merchant administration

```text
POST /api/v1/admin/merchants
POST /api/v1/admin/merchants/:merchantId/verify
POST /api/v1/admin/merchants/:merchantId/suspend
POST /api/v1/admin/merchants/:merchantId/reverify
```

### Agents

```text
GET  /api/v1/agents
POST /api/v1/agents
GET  /api/v1/agents/:agentId
POST /api/v1/agents/:agentId/versions
POST /api/v1/agents/:agentId/publish
POST /api/v1/agents/:agentId/runs
GET  /api/v1/agent-runs/:runId
```

### Mandates

```text
POST /api/v1/mandates
GET  /api/v1/mandates
GET  /api/v1/mandates/:mandateId
POST /api/v1/mandates/:mandateId/passkey/challenge
POST /api/v1/mandates/:mandateId/activate
POST /api/v1/mandates/:mandateId/revoke
```

### Transactions

```text
POST /api/v1/transactions/proposals
GET  /api/v1/transactions/:transactionId
POST /api/v1/transactions/:transactionId/approve
POST /api/v1/transactions/:transactionId/checkout
GET  /api/v1/transactions/:transactionId/events
GET  /api/v1/transactions/:transactionId/evidence
POST /api/v1/transactions/:transactionId/retry
POST /api/v1/transactions/:transactionId/cancel
```

### Merchant events

```text
POST /api/v1/events/merchant
```

Require signed requests, timestamp, nonce and replay protection.

### MCP

```text
POST /mcp
```

## 17.2 SignalWorks Merchant

```text
GET  /.well-known/mindpay.json
GET  /catalog/feed.json

POST /checkout_sessions
POST /checkout_sessions/:id
GET  /checkout_sessions/:id
POST /checkout_sessions/:id/complete
POST /checkout_sessions/:id/cancel

POST /payments/razorpay/callback
POST /webhooks/razorpay

POST /mcp
```

---

# 18. Frontend Product

## 18.1 Design direction

The interface must feel like a serious financial-control product, not a hackathon dashboard.

Principles:

- single-column information flow on critical payment pages
- clear hierarchy
- no dense card grids where a list or timeline is clearer
- exact monetary values always visible
- status represented by text and icon, not colour alone
- verification details available without overwhelming the default view
- every block/review decision explains what happened and how to resolve it
- responsive from 360 px to large desktop
- keyboard accessible
- WCAG AA contrast
- reduced-motion support

## 18.2 Pages

### Public

- Landing
- How it works
- Public marketplace preview
- Evidence verifier
- Sign in
- Launch demo workspace

### Authenticated

- Dashboard
- Marketplace
- Service detail
- Agents
- Agent detail
- Create agent
- Mandates
- Create mandate
- Agent workspace
- Transaction detail
- Evidence detail
- Settings and integrations

### Admin

- Merchant review queue
- Merchant verification detail
- Agent verification detail
- Incident and quarantine view

## 18.3 Critical screens

### Marketplace

Show:

- service
- merchant
- price
- verification tier
- fulfilment type
- latest verification time
- supported agent protocol
- payment rail
- trust details

### Mandate Builder

Sections:

1. Agent
2. Allowed merchants/categories/services
3. Per-transaction maximum
4. Total budget
5. Automatic approval threshold
6. Allowed payment rail
7. Expiry
8. Review summary
9. Passkey approval

### Agent Workspace

Layout:

- conversation
- current mandate summary
- structured offers
- decision explanation
- transaction progress
- approval sheet when required

### Transaction Detail

Top summary:

- amount
- merchant
- service
- status
- mandate
- agent
- Razorpay mode

Below:

- visual transaction state
- audit timeline
- policy decision
- risk decision
- payment verification
- fulfilment
- evidence download

### Blocked Transaction

Show:

- block title
- violated rule
- expected vs actual value
- whether any order was created
- whether budget was reserved
- recovery action

## 18.4 Shared components

- `VerificationBadge`
- `MerchantTrustPanel`
- `MandateSummary`
- `SpendMeter`
- `OfferComparison`
- `PolicyDecisionPanel`
- `RiskDecisionPanel`
- `ApprovalSheet`
- `RazorpayCheckoutButton`
- `TransactionStateStepper`
- `AuditTimeline`
- `EvidenceVerificationPanel`
- `EntitlementStatus`
- `AgentRunTranscript`
- `FailureExplanation`

## 18.5 Frontend/API contract

The frontend must never invent business state.

- Generate a typed client from the Gateway OpenAPI document or import shared Zod contracts.
- Use TanStack Query for all server state.
- Use optimistic updates only for reversible UI preferences, never payment or mandate state.
- Stream transaction events through WebSocket/SSE.
- Refetch canonical transaction state after reconnect.
- Every payment status display must derive from server state.

---

# 19. Testing and Evaluation

## 19.1 Unit tests

Cover:

- canonical JSON
- signatures
- key rotation
- mandate constraints
- policy rules
- risk rules
- state transition table
- budget reservation
- idempotency
- audit chain
- entitlement replay prevention
- Razorpay callback HMAC
- Razorpay webhook HMAC

## 19.2 Contract tests

- ACP `2026-04-17` schemas
- merchant manifest schema
- catalog schema
- signed checkout schema
- mandate schemas
- merchant event schema
- evidence schema
- MCP tool input/output schemas

## 19.3 Integration tests

- gateway ↔ merchant
- merchant ↔ mocked Razorpay
- signed merchant events
- D1 migration integrity
- queue processing
- webhook deduplication
- out-of-order events
- retry after timeout
- payment callback before webhook
- webhook before browser callback
- payment failed followed by captured reconciliation
- entitlement issue and redemption

## 19.4 End-to-end tests

1. successful ₹299 purchase
2. ₹449 approval-required purchase
3. ₹799 mandate block
4. invalid offer signature
5. expired offer
6. unapproved merchant
7. payment failure
8. duplicate callback
9. duplicate webhook
10. out-of-order webhook
11. agent tries to select arbitrary merchant URL
12. prompt injection inside merchant content
13. entitlement replay
14. fulfilment schema failure
15. evidence verification
16. mandate revocation during checkout

## 19.5 Security tests

- CSRF
- CORS
- session fixation
- broken object-level authorization
- SSRF through merchant endpoints
- open redirect
- replayed merchant event
- replayed passkey challenge
- timing-safe signature comparison
- secret scanning
- log redaction
- rate-limit bypass
- unsafe HTML in merchant content
- MCP over-permission
- illegal state transition
- budget race with concurrent transactions

## 19.6 AI evaluation set

Create at least 50 synthetic intents across:

- valid under-budget purchase
- over-budget purchase
- prohibited category
- ambiguous budget
- unverified merchant
- price mismatch
- preference conflict
- approval-required amount
- prompt injection in service description
- duplicate purchase request

Measure:

- correct service selection
- correct tool selection
- correct purchase proposal schema
- policy compliance
- unsafe purchase attempts
- explanation faithfulness to policy output

Required target:

- zero executed policy violations
- zero order creation for blocked transactions
- 100% detection of deterministic signature/amount/payee mismatches
- 100% duplicate webhook suppression
- 100% audit-chain verification in test suite

## 19.7 Performance targets

Exclude AI-provider latency from infrastructure measurements.

- p95 marketplace API under 300 ms after cache warmup
- p95 deterministic policy decision under 100 ms
- p95 transaction read under 250 ms
- webhook endpoint returns 2xx after verification and enqueue within 1 second
- real-time UI update visible within 1 second of processed event
- support at least 50 concurrent demo users without incorrect budget or state transitions

---

# 20. Deployment

## 20.1 Cloudflare resources

### MindPay Gateway

- Worker
- D1 database
- R2 evidence bucket
- KV marketplace cache
- Queue for merchant events and evidence jobs
- Durable Object for transaction event streaming
- Turnstile

### SignalWorks

- separate Worker
- separate D1 database
- private R2 bucket for raw Razorpay webhooks
- queue for webhook processing

### Web

- Next.js Worker
- static assets through Cloudflare
- internal service binding or HTTPS API access to Gateway

## 20.2 Suggested domains

```text
mindpay.giksn.com
api.mindpay.giksn.com
signalworks.mindpay.giksn.com
```

A `workers.dev` deployment is acceptable if custom DNS is unavailable, but all production-like tests must run against public HTTPS endpoints.

## 20.3 Secrets

Gateway:

```text
BETTER_AUTH_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
TURNSTILE_SECRET_KEY
PLATFORM_SIGNING_PRIVATE_JWK
AGENT_KEY_ENCRYPTION_SECRET
AI_PROVIDER_API_KEY
AI_MODEL
```

SignalWorks:

```text
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
MERCHANT_SIGNING_PRIVATE_JWK
MINDPAY_EVENT_URL
AI_PROVIDER_API_KEY
AI_MODEL
```

Never commit secrets or `.dev.vars`.

## 20.4 CI pipeline

For every pull request:

1. install with frozen lockfile
2. Biome check
3. TypeScript check
4. unit tests
5. contract tests
6. integration tests
7. Next.js build
8. Worker builds
9. secret scan

On main:

1. apply D1 migrations
2. deploy SignalWorks
3. deploy Gateway
4. deploy Web
5. run public smoke tests
6. run Razorpay Test Mode health check without creating uncontrolled orders
7. verify well-known manifest
8. verify public evidence page
9. record deployment commit and URLs

## 20.5 Observability

Use structured logs with:

- request ID
- transaction ID
- agent run ID
- merchant ID
- Razorpay order ID where available
- event type
- latency
- result

Never log:

- API secrets
- passkey private material
- full payment signatures
- full webhook bodies
- raw PII
- model-provider keys

Create dashboard counters:

- active transactions
- policy blocks
- approval-required transactions
- payment success/failure
- webhook signature failures
- duplicate events
- fulfilment success/failure
- evidence verification failures

---

# 21. Implementation Phases

## Phase 0 — Repository and engineering guardrails

### Tasks

- create pnpm/Turborepo monorepo
- add strict TypeScript configuration
- add Biome
- add Vitest and Playwright
- add GitHub Actions
- create `AGENTS.md`
- copy this plan into `docs/implementation-plan.md`
- create `docs/status.md`
- create ADR template
- configure environment validation
- scaffold web, gateway and merchant applications

### Acceptance

- all apps build
- lint and typecheck pass
- CI runs on a blank feature branch
- no secrets are committed
- preview deployment is possible

## Phase 1 — Shared contracts, crypto and protocol schemas

### Tasks

- create ULID and money helpers
- add canonical JSON
- implement SHA-256, HMAC and ES256 helpers
- implement AES-GCM key encryption helper
- define merchant manifest schema
- define catalog and service schemas
- define mandate schemas
- define audit and evidence schemas
- vendor ACP `2026-04-17` OpenAPI and JSON Schemas
- add conformance tests against official examples

### Acceptance

- all schemas reject malformed fixtures
- signatures verify and fail on one-byte mutation
- canonicalization has deterministic golden vectors
- ACP fixtures pass schema validation

## Phase 2 — Database, auth and tenancy

### Tasks

- define D1 schemas and migrations
- integrate Better Auth
- add Google/GitHub sign-in or email/password fallback
- add organisations and roles
- add passkey registration
- add secure cookies, CSRF and CORS
- create demo-workspace provisioning endpoint
- add database triggers protecting audit rows

### Acceptance

- user can create or enter a demo workspace
- role checks are enforced
- passkey can be registered on public HTTPS
- audit update/delete attempts fail
- unauthorized object access tests pass

## Phase 3 — SignalWorks merchant reference implementation

### Tasks

- implement well-known signed manifest
- implement signed catalog
- implement ACP checkout endpoints
- implement checkout state machine
- implement merchant key rotation structure
- implement outbound signed merchant events
- build three digital services
- build merchant admin seed command

### Acceptance

- MindPay contract tests can fetch and verify manifest/catalog
- checkout create/update/get/complete/cancel work idempotently
- mutated checkout fails signature verification
- service versions are immutable

## Phase 4 — Marketplace and verification engine

### Tasks

- merchant onboarding and admin review
- domain/manifest/key/catalog verification
- verification state machine
- service indexing and KV caching
- marketplace search
- quarantine and re-verification
- merchant and service detail APIs

### Acceptance

- approved merchant is discoverable
- unverified merchant is excluded from agent discovery
- manifest key change moves merchant to review
- invalid signature quarantines merchant
- cache invalidates on catalog version change

## Phase 5 — Agents and hosted runtime

### Tasks

- agent CRUD and immutable versioning
- encrypted agent signing keys
- model-provider abstraction
- approved tool registry
- structured agent tools
- buyer agent prompt and schemas
- agent run persistence
- streaming run events
- manual fallback flow

### Acceptance

- user can create and publish a specialised agent
- agent only sees approved tools
- agent cannot call arbitrary URLs
- structured proposal validates
- AI outage still permits manual commerce flow

## Phase 6 — Mandates, policy and risk

### Tasks

- mandate builder APIs
- passkey challenge and activation
- agent-signed closed mandate
- merchant checkout hash binding
- deterministic policy engine
- risk rules
- step-up approval
- atomic spend reservation, commit and release
- mandate revoke/expire/exhaust flows

### Acceptance

- ₹299 passes automatically
- ₹449 requires passkey approval
- ₹799 blocks
- concurrent purchases cannot exceed budget
- revoked mandate cannot create an order
- mismatched checkout hash blocks

## Phase 7 — Razorpay Test Mode

### Tasks

- typed Razorpay REST client
- order creation
- Standard Checkout configuration
- browser callback endpoint
- constant-time HMAC verification
- raw webhook verification
- webhook event deduplication
- queue processor
- out-of-order reconciliation
- payment status fetch
- payment failure and retry
- optional refund path
- optional read-only Razorpay MCP adapter behind feature flag

### Acceptance

- real Test Mode success completes
- real Test Mode failure is handled
- no fulfilment before captured/paid
- duplicate webhook is harmless
- invalid callback signature is rejected
- delayed webhook reconciliation works
- blocked transaction creates no Razorpay order

## Phase 8 — Entitlements and MCP fulfilment

### Tasks

- entitlement signing and verification
- one-time redemption
- SignalWorks MCP server
- MindPay MCP server
- service fulfilment
- structured-output validation
- signed delivery receipt
- replay protection

### Acceptance

- paid transaction can redeem once
- unpaid transaction cannot redeem
- second redemption fails
- wrong agent/service/audience fails
- delivery receipt verifies

## Phase 9 — Audit and evidence

### Tasks

- central audit append function
- audit event coverage for every state transition
- transaction event Durable Object
- final evidence bundle
- platform signature
- public verifier
- redacted evidence download
- evidence chain tests

### Acceptance

- successful flow creates complete evidence
- blocked flow creates complete evidence
- changed event breaks verification
- changed bundle breaks signature
- public verifier exposes no secrets

## Phase 10 — Frontend completion

Antigravity and Codex may begin this phase after Phase 2 using the shared contracts and MSW mocks. Final integration waits for the corresponding backend phases.

### Tasks

- landing and demo entry
- dashboard
- marketplace and service pages
- agent list/builder/detail
- mandate builder and passkey approval
- agent workspace
- offer comparison
- Razorpay checkout launcher
- real-time transaction state
- audit timeline
- evidence verifier
- admin merchant review
- blocked/failure states
- responsive and accessibility testing

### Acceptance

- no dead controls
- all screens use real API state
- 360 px, tablet and desktop layouts work
- keyboard navigation works
- reduced motion works
- payment state survives refresh/reconnect
- blocked reason is understandable without logs

## Phase 11 — Hardening, evals and reliability

### Tasks

- full E2E suite
- adversarial fixtures
- prompt-injection tests
- concurrent budget tests
- webhook chaos tests
- AI eval set
- load tests
- rate limits
- Turnstile
- CSP/HSTS/security headers
- log redaction
- dependency and secret scans
- threat model review

### Acceptance

- zero executed policy violations in evals
- all deterministic mismatch tests block
- all duplicate/reordering tests pass
- p95 targets pass
- security checklist passes
- no critical/high dependency vulnerabilities in the submission

## Phase 12 — Deployment and Buildathon package

### Tasks

- deploy all public services
- configure Razorpay Test Mode webhook
- seed SignalWorks and default agent
- create guest demo workspace
- add rate limits
- write README
- add Mermaid architecture diagrams
- write threat model
- write demo script
- write five-minute pitch
- record pitch video
- verify public repository
- run clean-room setup from README
- run final smoke tests

### Acceptance

- judge can use the product without local setup
- successful and failed payments work publicly
- public repo builds from documented commands
- architecture is understandable
- five-minute demo shows success, block, failure and audit
- no real money moves

---

# 22. Parallel Work Between Codex and Antigravity

| Workstream | Owner | Start condition |
|---|---|---|
| Repository, contracts, database, APIs | Codex | Immediately |
| Crypto, policy, risk, audit | Codex | Immediately after shared contracts |
| Merchant ACP and Razorpay | Codex | After protocol schemas |
| Agent runtime and MCP | Codex | After tool contracts |
| Design system and page shells | Antigravity + Codex | After Phase 0 |
| Typed frontend data layer | Antigravity + Codex | After Gateway OpenAPI is generated |
| Marketplace/agent/mandate UI | Antigravity + Codex | With MSW fixtures after Phase 2 |
| Payment and audit UI | Antigravity + Codex | After transaction contracts freeze |
| Browser E2E validation | Antigravity + Codex | Continuously |
| Final integration and accessibility | Both | Phases 9–11 |

Rules for parallel work:

- `packages/contracts` is the shared boundary.
- Frontend never duplicates enums or schemas manually.
- Backend publishes OpenAPI on every CI build.
- MSW mocks must be generated from the same fixtures used by backend tests.
- Contract changes require a changelog entry and both workstreams must update in the same PR or coordinated PRs.

---

# 23. Buildathon Submission Assets

## 23.1 README

Must include:

- product statement
- problem
- why Razorpay
- architecture
- trust model
- setup
- environment variables
- Cloudflare deployment
- Razorpay Test Mode setup
- webhook setup
- test commands
- demo credentials/workspace flow
- security assumptions
- known production migration requirements

## 23.2 Architecture diagrams

Provide Mermaid diagrams for:

1. system context
2. successful purchase sequence
3. payment failure sequence
4. policy block sequence
5. audit evidence chain
6. trust boundaries

## 23.3 Five-minute pitch structure

```text
0:00–0:30  Problem: agents can decide but cannot be blindly trusted with money
0:30–1:00  MindPay: verified agent-commerce control plane
1:00–1:35  User creates bounded mandate
1:35–2:15  Agent discovers and compares verified services
2:15–3:00  Deterministic policy creates Razorpay Test Mode checkout
3:00–3:35  Payment capture, entitlement and MCP fulfilment
3:35–4:15  Audit timeline and evidence verifier
4:15–4:40  Show ₹799 policy block or tampered offer
4:40–5:00  Why this is Razorpay’s natural next layer
```

## 23.4 Judge-facing proof points

Show on screen:

- exact mandate
- exact signed offer
- policy decision
- risk decision
- Razorpay order ID
- callback signature verified
- webhook signature verified
- captured/paid state
- entitlement redeemed once
- fulfilment output hash
- audit-chain verification
- failed transaction with no fulfilment
- blocked transaction with no Razorpay order

---

# 24. Definition of Done

The Buildathon release is complete only when all conditions below are true.

## Product

- [ ] A judge can launch a public demo workspace.
- [ ] A judge can create or inspect an agent.
- [ ] A judge can create and activate a mandate.
- [ ] The agent discovers only approved services.
- [ ] The agent can complete the successful purchase flow.
- [ ] The purchased MCP service is fulfilled.
- [ ] A complete audit trail is visible.
- [ ] The evidence bundle verifies publicly.
- [ ] A policy block works before order creation.
- [ ] A Razorpay payment failure is handled gracefully.

## Payment safety

- [ ] Razorpay secret remains server-side.
- [ ] Razorpay order is created only after deterministic approval.
- [ ] Callback HMAC is verified.
- [ ] Webhook HMAC is verified over the raw body.
- [ ] Duplicate webhook events are deduplicated.
- [ ] Out-of-order events are reconciled.
- [ ] Fulfilment requires captured payment and paid order.
- [ ] Budget reservation is atomic.
- [ ] Failed/cancelled transactions release reserved budget.
- [ ] Entitlement is single-use.

## Verification

- [ ] Merchant manifest and catalog are signed.
- [ ] Checkout is signed and hash-bound to the mandate.
- [ ] Agent version is immutable and identified.
- [ ] Passkey proof is stored for approvals.
- [ ] Audit rows are append-only.
- [ ] Evidence bundle is signed.
- [ ] Public verifier detects tampering.

## Engineering

- [ ] Strict TypeScript passes.
- [ ] Biome passes.
- [ ] Unit, contract, integration and E2E tests pass.
- [ ] Security tests pass.
- [ ] Public deployment passes smoke tests.
- [ ] README works from a clean clone.
- [ ] Public repo contains no secrets.
- [ ] Architecture and threat model are documented.
- [ ] Five-minute pitch is ready.

---

# 25. Future Extensions After the Buildathon

These must not delay the Buildathon implementation.

- Razorpay Live Mode and merchant onboarding
- UPI Reserve Pay delegated spending
- official NPCI UAP adapter when a public implementation path is available
- full AP2 SD-JWT selective-disclosure credentials
- x402 rail for crypto-native APIs and MCP tools
- MPP rail for multi-method machine payments
- bank and card subaccounts through regulated partners
- multiple merchant Razorpay accounts and settlement
- enterprise maker-checker approval
- private organisation marketplaces
- continuous runtime attestation
- provider bonds, escrow and dispute resolution
- portable agent reputation
- blockchain anchoring only when independent public verification is required

The existing abstractions must make these additions possible without rewriting the policy, audit or agent layers.

---

# 26. Official References Used for the Plan

- Razorpay AI Buildathon: https://razorpay.com/buildathon/
- Razorpay Standard Checkout: https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/
- Razorpay Webhook Validation: https://razorpay.com/docs/webhooks/validate-test/
- Razorpay Webhook Best Practices: https://razorpay.com/docs/webhooks/best-practices/
- Razorpay Orders API: https://razorpay.com/docs/api/orders/create/
- Razorpay MCP Server: https://razorpay.com/docs/mcp-server/
- AP2 Specification: https://ap2-protocol.org/ap2/specification/
- AP2 Payment Mandate: https://ap2-protocol.org/ap2/payment_mandate/
- ACP Repository: https://github.com/agentic-commerce-protocol/agentic-commerce-protocol
- Agentic Checkout Spec: https://developers.openai.com/commerce/specs/checkout
- Cloudflare Remote MCP: https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/
- Cloudflare Workers: https://developers.cloudflare.com/workers/
- OpenNext Cloudflare: https://opennext.js.org/cloudflare
