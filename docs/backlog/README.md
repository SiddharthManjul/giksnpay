# MindPay delivery backlog

This directory turns the 13 implementation phases in `Mindpay.md` into tickets small enough to
implement, review, test, and roll back independently.

## Operating rules

1. Work phases in order unless a ticket explicitly has no dependency on an earlier phase.
2. Start a ticket only when every listed dependency is Done.
3. Keep one primary outcome per ticket. Split work that grows beyond three engineering days.
4. A ticket is Done only when its acceptance criteria and affected checks pass.
5. Every completed ticket updates `docs/status.md`; every architectural change adds or supersedes an ADR.
6. Never weaken security, verification, idempotency, audit, or failure handling to close a UI ticket.

## Status vocabulary

- **Ready:** dependencies are satisfied or clearly listed.
- **In progress:** actively being implemented by one owner.
- **Blocked:** cannot proceed without a named external input or dependency.
- **Done:** acceptance criteria are verified and recorded.

## Phase dependency graph

```text
P0 Foundation
  -> P1 Contracts/Crypto
      -> P2 Auth/Data
      -> P3 SignalWorks
          -> P4 Marketplace
              -> P5 Agents
                  -> P6 Mandates/Policy
                      -> P7 Razorpay
                          -> P8 Entitlements/MCP
                              -> P9 Audit/Evidence
                                  -> P10 Frontend
                                      -> P11 Hardening
                                          -> P12 Deployment
```

Frontend foundations may proceed after P0 using shared contracts and generated mocks, but final
integration tickets retain their backend dependencies.

## Epic index

| Phase | Epic | Ticket count | Exit gate |
|---:|---|---:|---|
| 0 | [Repository and engineering guardrails](./phase-00-foundation.md) | 7 | All workspaces install from a frozen lockfile; format, lint, typecheck, unit tests, and production builds pass in CI. |
| 1 | [Shared contracts, cryptography, and protocol schemas](./phase-01-contracts-crypto.md) | 7 | Malformed fixtures are rejected, one-byte signature mutations fail, canonical JSON matches golden vectors, and ACP conformance fixtures pass. |
| 2 | [Database, authentication, and tenancy](./phase-02-auth-tenancy.md) | 7 | Users can enter a demo workspace, role and object authorization is enforced, passkeys register on HTTPS, and audit rows cannot be mutated. |
| 3 | [SignalWorks merchant reference implementation](./phase-03-signalworks.md) | 7 | MindPay verifies the signed manifest and catalog, ACP checkout operations are idempotent, mutated payloads fail, and service versions are immutable. |
| 4 | [Marketplace and merchant verification](./phase-04-marketplace.md) | 6 | Only approved merchants are agent-discoverable; material changes trigger review or quarantine; catalog cache changes follow signed version changes. |
| 5 | [Agents and hosted runtime](./phase-05-agents.md) | 7 | Published agents are immutable, see only approved typed tools, cannot fetch arbitrary URLs, produce valid proposals, and retain a manual fallback. |
| 6 | [Mandates, policy, and risk](./phase-06-mandates-policy.md) | 8 | ₹299 auto-approves, ₹449 requires a valid passkey approval, ₹799 blocks, revoked mandates cannot order, and concurrent reservations cannot exceed budget. |
| 7 | [Razorpay Test Mode](./phase-07-razorpay.md) | 9 | Real Test Mode success and failure work; invalid and duplicate evidence is harmless; only captured payment plus paid order can fulfil. |
| 8 | [Entitlements and MCP fulfilment](./phase-08-entitlements-mcp.md) | 7 | A captured-and-paid transaction receives one scoped entitlement; it redeems once; unpaid, replayed, wrong-audience, or wrong-service redemption fails. |
| 9 | [Audit, realtime events, and evidence](./phase-09-audit-evidence.md) | 6 | Successful, blocked, and failed transactions produce complete signed evidence; any event or bundle mutation fails public verification without leaking secrets. |
| 10 | [Frontend product completion](./phase-10-frontend.md) | 10 | All specified pages use canonical APIs, critical flows survive refresh/reconnect, blocked reasons are clear, and 360px through desktop layouts meet keyboard, contrast, and reduced-motion requirements. |
| 11 | [Hardening, evaluations, and reliability](./phase-11-hardening.md) | 8 | No executed policy violations; deterministic mismatches, duplicate and reordered events, security checks, load targets, and dependency scans all pass. |
| 12 | [Deployment and Buildathon submission](./phase-12-deployment.md) | 7 | A judge can use the public product without local setup, run success/block/failure flows, verify evidence, and reproduce the repository from the README without moving real money. |

Total: 96 implementation tickets.

## Definition of ready

- Outcome, dependencies, and authority boundary are explicit.
- Inputs and external contracts are versioned or named.
- Failure behavior and forbidden side effects are testable.
- No unresolved product decision is delegated to the implementer.

## Definition of done

- Acceptance criteria pass with evidence.
- Formatting, lint, typecheck, affected tests, and affected builds pass.
- No secret, PII, raw webhook, private key, or hidden model reasoning is logged.
- Documentation, status, and ADRs are current.
- The change can be reverted without corrupting canonical money or audit state.

