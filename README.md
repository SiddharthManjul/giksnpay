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

## Commands

```bash
pnpm install
pnpm dev
pnpm check
pnpm build
pnpm test:e2e
```

No production or test secrets are committed. Copy the relevant `.env.example` or `.dev.vars.example`
file when a later implementation phase introduces credentials.
