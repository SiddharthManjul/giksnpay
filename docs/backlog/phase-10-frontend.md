# Phase 10: Frontend product completion

Source: `Mindpay.md`, implementation Phase 10.

## Exit gate

All specified pages use canonical APIs, critical flows survive refresh/reconnect, blocked reasons are clear, and 360px through desktop layouts meet keyboard, contrast, and reduced-motion requirements.

## Tickets

### MP-1001: Create the financial-control design system and application shell

- Priority: High
- Status: Ready
- Depends on: MP-0007
- Size: 1-3 engineering days

**Outcome**

Implement typography, spacing, tokens, navigation, status semantics, focus behavior, and shared page shells.

**Acceptance criteria**

- [ ] Status uses text and icon rather than color alone.
- [ ] Tokens pass WCAG AA contrast and reduced-motion checks.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-1002: Implement public pages, sign-in, and demo entry

- Priority: High
- Status: Ready
- Depends on: MP-0206, MP-1001
- Size: 1-3 engineering days

**Outcome**

Build landing, how-it-works, marketplace preview, sign-in, verifier entry, and launch-demo flow.

**Acceptance criteria**

- [ ] No public control is dead or backed by invented business state.
- [ ] Demo entry creates or resumes an isolated workspace.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-1003: Implement marketplace, service, and merchant trust views

- Priority: High
- Status: Ready
- Depends on: MP-0405, MP-1001
- Size: 1-3 engineering days

**Outcome**

Render verified catalog search, prices, merchant trust, protocol, rail, fulfilment, and verification freshness.

**Acceptance criteria**

- [ ] Unverified services never appear.
- [ ] All merchant content is rendered safely as untrusted data.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-1004: Implement agent list, builder, detail, and run views

- Priority: High
- Status: Ready
- Depends on: MP-0507, MP-1001
- Size: 1-3 engineering days

**Outcome**

Create and publish agents, show immutable versions and tools, and stream concise run transcripts.

**Acceptance criteria**

- [ ] The UI cannot bind an unapproved tool.
- [ ] Provider outage exposes the manual fallback instead of a dead workspace.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-1005: Implement mandate builder and passkey activation

- Priority: Critical
- Status: Ready
- Depends on: MP-0602, MP-0606, MP-1001
- Size: 1-3 engineering days

**Outcome**

Build all nine mandate sections, canonical review, spend meter, registration guidance, and passkey proof flow.

**Acceptance criteria**

- [ ] Exact limits, rail, allowlists, expiry, and approval threshold are visible before signing.
- [ ] Activation displays server-verified state after refresh.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-1006: Implement agent workspace, offer comparison, and proposal states

- Priority: Critical
- Status: Ready
- Depends on: MP-0505, MP-0604, MP-1003, MP-1004
- Size: 1-3 engineering days

**Outcome**

Combine conversation, mandate summary, signed offers, selection explanation, and deterministic policy response.

**Acceptance criteria**

- [ ] The ₹299, ₹449, and ₹799 cases render distinct allow, approval, and block states.
- [ ] Model text never substitutes for structured policy reasons.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-1007: Implement Razorpay checkout launcher and payment recovery UI

- Priority: Critical
- Status: Ready
- Depends on: MP-0707, MP-1006
- Size: 1-3 engineering days

**Outcome**

Launch Standard Checkout with server-provided safe fields and render pending, failed, retry, reconciling, and captured states.

**Acceptance criteria**

- [ ] Payment state survives refresh and reconnect.
- [ ] Failed payment shows released budget and only a permitted retry action.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-1008: Implement transaction, audit, fulfilment, and evidence views

- Priority: Critical
- Status: Ready
- Depends on: MP-0905, MP-1007
- Size: 1-3 engineering days

**Outcome**

Build the transaction stepper, audit timeline, decision panels, payment proofs, entitlement status, output, and verifier.

**Acceptance criteria**

- [ ] Blocked state shows expected versus actual, order-created, and budget-reserved facts.
- [ ] Public verification exposes all proof results without sensitive data.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-1009: Implement admin verification and incident views

- Priority: High
- Status: Ready
- Depends on: MP-0403, MP-1001
- Size: 1-3 engineering days

**Outcome**

Build merchant review, verification evidence, agent verification, quarantine, and incident resolution surfaces.

**Acceptance criteria**

- [ ] Role enforcement matches API permissions.
- [ ] Material changes and signature failures have explicit recovery actions.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-1010: Complete responsive, accessibility, reconnect, and frontend contract tests

- Priority: Critical
- Status: Ready
- Depends on: MP-1002, MP-1003, MP-1004, MP-1005, MP-1006, MP-1007, MP-1008, MP-1009
- Size: 1-3 engineering days

**Outcome**

Close the UI phase across 360px, tablet, desktop, keyboard, reduced motion, network interruption, and API contract drift.

**Acceptance criteria**

- [ ] Automated accessibility checks have no critical violations on critical screens.
- [ ] All payment and mandate displays derive from canonical server state after reconnect.
- [ ] Affected checks pass and `docs/status.md` is updated.

## Phase completion

- [ ] Every ticket above is Done.
- [ ] The exit gate is demonstrated in CI or a reproducible verification record.
- [ ] Architecture changes are recorded in `docs/adr/`.

