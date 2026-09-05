# Phase 10 verification: product frontend

Date: 2026-09-05

## Exit gate

All specified public, authenticated, transaction, evidence, and administration pages are implemented
against canonical APIs. The product stays usable from 360 pixels through desktop, exposes keyboard
focus and reduced-motion behavior, and never advances money or mandate state optimistically.

## Evidence

| Surface | Verified behavior |
|---|---|
| Visual system | Self-hosted Manrope/JetBrains Mono, one signal color, tabular money, ruled registers, visible focus, icon-plus-text status, mobile navigation, and reduced-motion overrides |
| Public | Landing, authority explanation, verified marketplace, sign-in, isolated demo provisioning, verifier entry, and public evidence detail have no placeholder controls |
| Marketplace | Shared Zod contracts render only current verified services, exact integer-subunit prices, protocol/rail/fulfilment, and current merchant trust |
| Agents | Identity and immutable version creation, approved-tool-only binding, publication, run ledger, hashed tool calls, provider-outage fallback, and signed proposal presentation use canonical responses |
| Mandates | All authority inputs, exact INR limits, allowlists, rail, expiry, passkey activation, and canonical spend/reservation meter are server-derived |
| Policy cases | Existing integration proves ₹299 `ALLOW`, ₹449 `APPROVAL_REQUIRED`, and ₹799 `BLOCK`; the client renders the structured policy/risk reason and evidence rather than model prose |
| Razorpay | Only the server-issued public checkout configuration enters Standard Checkout; browser callback is merchant-verified through the Gateway; pending orders resume after refresh; retry is server-authorized |
| Transactions | Canonical polling plus authorized WebSocket refresh hints drive the state rail, next valid action, exact bindings, audit chain, payment/fulfilment states, and evidence link |
| Blocked/failure | Blocked state states that order creation and budget reservation did not occur and renders expected/actual reason evidence; failed payment offers only the bounded retry operation |
| Administration | Merchant review, verification/reverification, suspension, incident/quarantine, and immutable agent assurance views are gated by the same API role capabilities |
| Browser safety | CSP, frame denial, content-type, referrer, opener, and permissions headers are present; the Razorpay secret and all private signing material remain server-only |
| Responsive/keyboard | Playwright verifies the primary statement, public navigation, skip-link focus, verifier input, and no horizontal overflow at 360-pixel and tablet widths |
| Accessibility | Axe reports no serious or critical WCAG 2/2.1 A/AA violations on landing, verifier, and mocked authenticated ledger screens |
| Recovery/motion | Playwright verifies reduced-motion animation removal, explicit offline/online labels, and canonical query refetch after reconnect |

## Reproduction

```bash
pnpm verify:phase-10
pnpm test:e2e
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Production build output contains all 24 product routes and the embedded design direction contract.
No raster image ships in the frontend, so the provenance record has no shipping raster entries.

Architecture decision: `docs/adr/0026-frontend-canonical-state-ledger.md`.
