# MindPay

MindPay is a verified agent-commerce gateway that lets an AI buyer discover and propose
digital-service purchases while deterministic policy, payment verification, and audit code retain
authority over money.

The Buildathon release uses Razorpay Test Mode and a separately deployed reference merchant,
SignalWorks. See [`Mindpay.md`](./Mindpay.md) for the complete product and implementation plan.

## Workspace

```text
apps/web                    Next.js user interface
apps/gateway                MindPay Cloudflare Worker API
apps/merchant-signalworks   Reference merchant Cloudflare Worker
packages/*                  Shared contracts and domain libraries
```

## Local requirements

- Node.js 22 or newer
- pnpm 10 or newer

## Environment reference

[`.env.example`](./.env.example) documents every application-controlled variable required through
Phase 7, including validation constraints and which integrations are optional. It is a reference
file only: Wrangler does not load it automatically.

For local Workers, copy only the relevant secret subset into the ignored
`apps/gateway/.dev.vars` and `apps/merchant-signalworks/.dev.vars` files. The application-specific
`.dev.vars.example` files remain the shortest copyable templates. Keep non-secret origins, model
selection, and resource bindings in each application's `wrangler.jsonc`.

## Commands

```bash
pnpm install
pnpm dev
pnpm check
pnpm build
pnpm test:e2e
```

SignalWorks has a separate D1 database and key-encryption secret. See
[`apps/merchant-signalworks/README.md`](./apps/merchant-signalworks/README.md) before running its
idempotent local seed.

No production or test secrets are committed. Never put real values in `.env.example`,
`.dev.vars.example`, tracked Wrangler variables, application source, logs, or browser responses.
