# Phase 0 verification

- Date: 2026-08-28
- Result: Pass
- Credentials required: None

## Toolchain resolved by the frozen lockfile

| Tool | Version |
|---|---:|
| Node.js | 24.10.0 |
| pnpm | 10.30.3 |
| TypeScript | 7.0.2 |
| Turborepo | 2.10.12 |
| Biome | 2.5.11 |
| Vitest | 4.1.11 |
| Playwright | 1.62.1 |
| Next.js | 16.3.3 |
| Wrangler | 4.127.1 |
| OpenNext Cloudflare | 1.20.4 |

## Verified commands

| Command | Result | Proves |
|---|---|---|
| `pnpm install --frozen-lockfile` | Pass | Lockfile and all 19 workspace projects install deterministically |
| `pnpm check` | Pass | Formatting, lint, strict typecheck, and unit tests pass |
| `pnpm build` | Pass | All 18 application/package builds pass |
| `pnpm --filter @mindpay/web build:cloudflare` | Pass | OpenNext produces `.open-next/worker.js` |
| `pnpm test:e2e` | Pass | Chromium loads MindPay on the isolated test port and verifies the authority statement |

## Tested application behavior

- MindPay Web renders the product name and states that agents do not receive unchecked money
  authority.
- Gateway `/health` validates its environment and response through shared Zod contracts.
- SignalWorks `/health` validates its environment and response through the same contract boundary.
- Invalid service health state and unexpected environment bindings are rejected.

## Known environment behavior

Next.js development servers require local port permission in the managed execution sandbox. The
Playwright suite uses dedicated port `3310` with server reuse disabled, preventing another local app
from producing a false-positive test result.
