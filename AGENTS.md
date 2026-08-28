# MindPay engineering instructions

`Mindpay.md` is the product source of truth. Implement its phases in order and keep
`docs/status.md` current after every completed phase.

## Non-negotiable boundaries

- Use strict TypeScript. Do not use `any` in application code.
- Validate every external boundary with Zod or a vendored protocol JSON Schema.
- Keep model output outside payment authority, policy, verification, entitlement, and audit logic.
- Store money as integer currency subunits and timestamps in UTC.
- Make every mutation idempotent and every money transition auditable.
- Never expose payment secrets, signing private keys, raw webhook secrets, or passkey challenges.
- Do not add placeholder controls or fake critical-path data.
- Use the gstack `/browse` skill for all web browsing.

## Required checks

Run these before marking a ticket or phase complete:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run `pnpm test:e2e` when a ticket changes a user-facing flow.

## Shared boundaries

- `packages/contracts` owns cross-application request, response, event, and schema contracts.
- Frontends import generated or shared contracts; they never duplicate business enums.
- Published agent, merchant, service, catalog, and protocol versions are immutable.
- D1 is canonical for business state. KV, R2, queues, and Durable Objects are supporting stores.
