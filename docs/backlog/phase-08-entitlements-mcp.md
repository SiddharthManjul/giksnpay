# Phase 8: Entitlements and MCP fulfilment

Source: `Mindpay.md`, implementation Phase 8.

## Exit gate

A captured-and-paid transaction receives one scoped entitlement; it redeems once; unpaid, replayed, wrong-audience, or wrong-service redemption fails.

## Tickets

### MP-0801: Define entitlement, redemption, MCP, and delivery-receipt contracts

- Priority: Critical
- Status: Done
- Depends on: MP-0106, MP-0706
- Size: 1-3 engineering days

**Outcome**

Freeze strict inputs and outputs for JWT entitlements, MCP tools, service results, status, and merchant delivery receipts.

**Acceptance criteria**

- [x] JWT claims require issuer, audience, agent, transaction, merchant, service, scope, `jti`, issue time, and expiry.
- [x] Schemas reject over-broad scope and mismatched service output.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0802: Issue one-time entitlements after reconciled payment

- Priority: Critical
- Status: Done
- Depends on: MP-0706, MP-0801
- Size: 1-3 engineering days

**Outcome**

Have MindPay sign and persist a short-lived entitlement only when payment and order truth are final.

**Acceptance criteria**

- [x] Unpaid, failed, disputed, amount-mismatched, or wrong-order transactions receive no token.
- [x] Only a token hash is stored in canonical entitlement records.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0803: Verify and atomically consume entitlements at SignalWorks

- Priority: Critical
- Status: Done
- Depends on: MP-0802
- Size: 1-3 engineering days

**Outcome**

Validate the JWT and consume `jti` in the same atomic operation before running service work.

**Acceptance criteria**

- [x] Wrong issuer, audience, agent, merchant, service, scope, or expiry fails.
- [x] Concurrent redemption attempts yield exactly one success.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0804: Implement the SignalWorks MCP fulfilment server

- Priority: Critical
- Status: Done
- Depends on: MP-0803, MP-0303
- Size: 1-3 engineering days

**Outcome**

Expose only the two redemption tools and fulfilment-status tool with strict schemas.

**Acceptance criteria**

- [x] Tool discovery exposes no payment, database, file, network, or administrative capability.
- [x] Market Snapshot and Competitor Dossier enforce their exact service entitlement.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0805: Implement the MindPay remote MCP server

- Priority: High
- Status: Done
- Depends on: MP-0405, MP-0505
- Size: 1-3 engineering days

**Outcome**

Expose the six narrowly scoped marketplace, offer, proposal, status, and evidence tools.

**Acceptance criteria**

- [x] The MCP server has no raw CRUD or direct payment execution tool.
- [x] Every caller is authenticated, scoped, rate-limited, and audited.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0806: Implement structured service fulfilment and signed delivery receipts

- Priority: Critical
- Status: Done
- Depends on: MP-0502, MP-0804
- Size: 1-3 engineering days

**Outcome**

Generate or deterministically fixture a valid report, retry one schema failure, hash output, and sign the delivery receipt.

**Acceptance criteria**

- [x] Invalid output after one retry fails fulfilment without marking success.
- [x] MindPay verifies the receipt before storing the final result.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0807: Complete entitlement replay and fulfilment security tests

- Priority: Critical
- Status: Done
- Depends on: MP-0805, MP-0806
- Size: 1-3 engineering days

**Outcome**

Close Phase 8 with paid, unpaid, replay, expiry, wrong-binding, tool-permission, and schema-failure coverage.

**Acceptance criteria**

- [x] The paid happy path redeems exactly once and produces a verified receipt.
- [x] All adversarial cases fail without a second service execution.
- [x] Affected checks pass and `docs/status.md` is updated.

## Phase completion

- [x] Every ticket above is Done.
- [x] The exit gate is demonstrated in CI or a reproducible verification record.
- [x] Architecture changes are recorded in `docs/adr/`.
