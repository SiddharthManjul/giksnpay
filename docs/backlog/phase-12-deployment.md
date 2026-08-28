# Phase 12: Deployment and Buildathon submission

Source: `Mindpay.md`, implementation Phase 12.

## Exit gate

A judge can use the public product without local setup, run success/block/failure flows, verify evidence, and reproduce the repository from the README without moving real money.

## Tickets

### MP-1201: Provision isolated Cloudflare resources and secret bindings

- Priority: Critical
- Status: Ready
- Depends on: MP-1108
- Size: 1-3 engineering days

**Outcome**

Create Gateway, SignalWorks, and Web Workers plus separate D1, R2, KV, Queue, Durable Object, and Turnstile bindings.

**Acceptance criteria**

- [ ] Gateway and merchant secrets are scoped to their owning Workers.
- [ ] No secret value is committed, logged, or included in generated client assets.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-1202: Implement migration-first deployment and smoke-test automation

- Priority: Critical
- Status: Ready
- Depends on: MP-1201
- Size: 1-3 engineering days

**Outcome**

Deploy SignalWorks, Gateway, and Web in dependency order after migrations, then verify public health and trust artifacts.

**Acceptance criteria**

- [ ] A failed migration or smoke test stops promotion.
- [ ] Deployment records commit SHA, resource versions, and public URLs.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-1203: Configure public domains, HTTPS, and Razorpay Test Mode webhook

- Priority: Critical
- Status: Ready
- Depends on: MP-1202
- Size: 1-3 engineering days

**Outcome**

Connect the chosen domains or workers.dev URLs, enforce HTTPS, and register the exact SignalWorks webhook endpoint.

**Acceptance criteria**

- [ ] Well-known, catalog, MCP, checkout, callback, webhook, API, and verifier origins match signed configuration.
- [ ] A signed Razorpay Test Mode event reaches the correct merchant deployment.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-1204: Seed SignalWorks, the default agent, mandate, and guest demo workspace

- Priority: Critical
- Status: Ready
- Depends on: MP-1203
- Size: 1-3 engineering days

**Outcome**

Make the judge path reproducible with three services, the procurement agent, bounded mandate, and isolated guest data.

**Acceptance criteria**

- [ ] A fresh demo produces ₹299 allow, ₹449 approval, and ₹799 block behavior.
- [ ] Seed reruns do not duplicate logical entities.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-1205: Complete README, API, architecture, threat, and demo documentation

- Priority: High
- Status: Ready
- Depends on: MP-1204
- Size: 1-3 engineering days

**Outcome**

Document setup, environment, deployment, webhook, tests, assumptions, production migration, six diagrams, and exact five-minute demo flow.

**Acceptance criteria**

- [ ] A clean reader can explain the trust model and authority boundaries.
- [ ] All commands and URLs are validated against the deployed release.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-1206: Prepare the five-minute pitch and judge-facing proof sequence

- Priority: High
- Status: Ready
- Depends on: MP-1204, MP-1205
- Size: 1-3 engineering days

**Outcome**

Create the timed pitch, recording plan, and on-screen proof checklist for success, block, failure, and audit.

**Acceptance criteria**

- [ ] A rehearsal finishes within five minutes while showing every required proof point.
- [ ] The pitch makes no Live Mode, AP2 certification, or unsupported protocol claim.
- [ ] Affected checks pass and `docs/status.md` is updated.

### MP-1207: Run clean-room setup, public smoke tests, and release sign-off

- Priority: Critical
- Status: Ready
- Depends on: MP-1205, MP-1206
- Size: 1-3 engineering days

**Outcome**

Rebuild from a clean clone and execute public success, payment failure, policy block, tamper, fulfilment, and evidence verification.

**Acceptance criteria**

- [ ] The public repo builds only from documented commands.
- [ ] The final checklist in `Mindpay.md` is fully checked with no real-money transaction.
- [ ] Affected checks pass and `docs/status.md` is updated.

## Phase completion

- [ ] Every ticket above is Done.
- [ ] The exit gate is demonstrated in CI or a reproducible verification record.
- [ ] Architecture changes are recorded in `docs/adr/`.

