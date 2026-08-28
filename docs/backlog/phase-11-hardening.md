# Phase 11: Hardening, evaluations, and reliability

Source: `Mindpay.md`, implementation Phase 11.

## Exit gate

No executed policy violations; deterministic mismatches, duplicate and reordered events, security checks, load targets, and dependency scans all pass.

## Tickets

### MP-1101: Implement the complete commerce E2E matrix

- Priority: Critical
- Status: Ready
- Depends on: MP-1010
- Size: 1-3 engineering days

**Outcome**

Automate all 16 specified purchase, failure, integrity, replay, injection, schema, evidence, and revocation journeys.

**Acceptance criteria**

- [ ] Every scenario asserts both visible outcome and absence of forbidden side effects.
- [ ] The suite is deterministic against seeded data and mocked provider cases.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-1102: Build adversarial fixtures and the 50-intent AI evaluation set

- Priority: Critical
- Status: Ready
- Depends on: MP-0507, MP-1101
- Size: 1-3 engineering days

**Outcome**

Cover budget, category, ambiguity, verification, mismatch, preference, approval, prompt injection, and duplicate intent classes.

**Acceptance criteria**

- [ ] At least 50 versioned fixtures report service selection, tool selection, proposal validity, policy compliance, unsafe attempts, and explanation faithfulness.
- [ ] Evaluation runs never execute a policy violation.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-1103: Run concurrent-budget and webhook chaos testing

- Priority: Critical
- Status: Ready
- Depends on: MP-0608, MP-0706
- Size: 1-3 engineering days

**Outcome**

Inject concurrency, duplicate, reorder, delay, timeout, and retry conditions across reservations and payment events.

**Acceptance criteria**

- [ ] Budget never exceeds the mandate under 50 concurrent demo users.
- [ ] Webhook duplication suppression and audit verification remain 100%.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-1104: Complete application and protocol security testing

- Priority: Critical
- Status: Ready
- Depends on: MP-1101
- Size: 1-3 engineering days

**Outcome**

Test CSRF, CORS, sessions, BOLA, SSRF, redirects, replay, timing, unsafe HTML, MCP permissions, and illegal transitions.

**Acceptance criteria**

- [ ] All named security classes have explicit automated allow/deny assertions.
- [ ] No critical trust-boundary decision depends on model output or browser text.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-1105: Add rate limits, Turnstile, CSP, HSTS, and security headers

- Priority: High
- Status: Ready
- Depends on: MP-1104
- Size: 1-3 engineering days

**Outcome**

Protect public and authenticated surfaces with endpoint-specific abuse limits and browser security policy.

**Acceptance criteria**

- [ ] Rate-limit keys cannot be bypassed through trivial header changes.
- [ ] Headers pass automated checks without breaking Razorpay Checkout or MCP.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-1106: Add structured observability and log redaction

- Priority: High
- Status: Ready
- Depends on: MP-0902, MP-1104
- Size: 1-3 engineering days

**Outcome**

Emit request, transaction, run, merchant, provider-order, event, latency, and result fields plus required counters.

**Acceptance criteria**

- [ ] Secrets, full signatures, webhook bodies, PII, and model keys are redacted in tests.
- [ ] Correlation IDs connect gateway, merchant, queue, and evidence jobs.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-1107: Meet infrastructure load and latency targets

- Priority: High
- Status: Ready
- Depends on: MP-1103, MP-1106
- Size: 1-3 engineering days

**Outcome**

Measure warm marketplace, policy, transaction reads, webhook ingestion, realtime updates, and 50-user concurrency excluding AI latency.

**Acceptance criteria**

- [ ] All p95 targets in `Mindpay.md` pass in a reproducible report.
- [ ] A failed target blocks phase completion and records the bottleneck.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-1108: Complete dependency, secret, and threat-model review

- Priority: Critical
- Status: Ready
- Depends on: MP-1105, MP-1107
- Size: 1-3 engineering days

**Outcome**

Run dependency and secret scans, document threats and mitigations, and close all critical/high submission risks.

**Acceptance criteria**

- [ ] No committed secret or critical/high exploitable dependency remains.
- [ ] The threat model covers every browser, model, gateway, merchant, provider, storage, and MCP boundary.
- [ ] Affected checks pass and `docs/status.md` is updated.

## Phase completion

- [ ] Every ticket above is Done.
- [ ] The exit gate is demonstrated in CI or a reproducible verification record.
- [ ] Architecture changes are recorded in `docs/adr/`.

