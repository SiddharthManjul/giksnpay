# Phase 5: Agents and hosted runtime

Source: `Mindpay.md`, implementation Phase 5.

## Exit gate

Published agents are immutable, see only approved typed tools, cannot fetch arbitrary URLs, produce valid proposals, and retain a manual fallback.

## Tickets

### MP-0501: Implement agent CRUD, immutable versions, and encrypted signing keys

- Priority: Critical
- Status: Ready
- Depends on: MP-0203, MP-0104
- Size: 1-3 engineering days

**Outcome**

Create organisation-scoped agents, publish immutable versions, and store encrypted private JWKs.

**Acceptance criteria**

- [ ] Published policy/configuration/tool bindings cannot be updated in place.
- [ ] Decryption requires the configured encryption secret and never reaches logs or clients.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-0502: Implement the AI model-provider abstraction

- Priority: High
- Status: Ready
- Depends on: MP-0501
- Size: 1-3 engineering days

**Outcome**

Create typed streaming and structured-generation interfaces with one configurable real provider.

**Acceptance criteria**

- [ ] Provider-specific code is isolated behind the shared interface.
- [ ] Invalid structured output is rejected without reaching commerce orchestration.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-0503: Implement the approved tool registry and permission scopes

- Priority: Critical
- Status: Ready
- Depends on: MP-0405, MP-0501
- Size: 1-3 engineering days

**Outcome**

Bind immutable tool versions and scopes to each published agent version.

**Acceptance criteria**

- [ ] The runtime exposes only explicitly bound tools.
- [ ] Arbitrary URL fetch, shell, raw database, policy mutation, and payment tools are absent.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-0504: Implement persisted agent runs and tool-call evidence

- Priority: High
- Status: Ready
- Depends on: MP-0502, MP-0503
- Size: 1-3 engineering days

**Outcome**

Store run state, intent and decision summaries, typed tool inputs/outputs, hashes, and latency.

**Acceptance criteria**

- [ ] Hidden chain-of-thought is neither requested nor persisted.
- [ ] Failed and timed-out tools close with explicit audited status.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-0505: Implement the procurement agent discovery and proposal sequence

- Priority: Critical
- Status: Ready
- Depends on: MP-0504
- Size: 1-3 engineering days

**Outcome**

Parse intent, search verified services, request signed offers, compare constraints, explain selection, and propose purchase.

**Acceptance criteria**

- [ ] “Buy the best competitor research under ₹400” selects the current ₹299 offer.
- [ ] Prompt injection in merchant text cannot select an unapproved tool or recipient.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-0506: Stream agent-run and transaction progress

- Priority: High
- Status: Ready
- Depends on: MP-0504
- Size: 1-3 engineering days

**Outcome**

Expose reconnectable run events while canonical state remains server-owned.

**Acceptance criteria**

- [ ] Clients resume after disconnect and refetch canonical state.
- [ ] No streamed model text can advance a transaction state.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-0507: Implement manual commerce fallback and agent evaluations

- Priority: Critical
- Status: Ready
- Depends on: MP-0505, MP-0506
- Size: 1-3 engineering days

**Outcome**

Allow verified manual service selection when the model provider is unavailable and establish initial intent evals.

**Acceptance criteria**

- [ ] Manual selection reaches the same deterministic proposal contract.
- [ ] Provider outage leaves marketplace, verification, checkout orchestration, and evidence paths usable.
- [ ] Affected checks pass and `docs/status.md` is updated.

## Phase completion

- [ ] Every ticket above is Done.
- [ ] The exit gate is demonstrated in CI or a reproducible verification record.
- [ ] Architecture changes are recorded in `docs/adr/`.

