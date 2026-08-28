# Phase 0: Repository and engineering guardrails

Source: `Mindpay.md`, implementation Phase 0.

## Exit gate

All workspaces install from a frozen lockfile; format, lint, typecheck, unit tests, and production builds pass in CI.

## Tickets

### MP-0001: Initialize the pnpm/Turborepo workspace

- Priority: Critical
- Status: Done
- Depends on: None
- Size: 1-3 engineering days

**Outcome**

Create the versioned repository root, workspace discovery, strict TypeScript baseline, Biome, and deterministic package-manager settings.

**Acceptance criteria**

- [x] A clean clone can run `pnpm install --frozen-lockfile`.
- [x] `pnpm format:check`, `pnpm lint`, and the root Turbo graph run without configuration errors.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0002: Scaffold the three deployable applications

- Priority: Critical
- Status: Done
- Depends on: MP-0001
- Size: 1-3 engineering days

**Outcome**

Create buildable shells for MindPay Web, MindPay Gateway, and SignalWorks without collapsing their authority boundaries.

**Acceptance criteria**

- [x] The Next.js web app builds and renders the product authority statement.
- [x] Both Hono Workers build independently and expose tested `/health` responses.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0003: Establish shared package boundaries and environment validation

- Priority: High
- Status: Done
- Depends on: MP-0001
- Size: 1-3 engineering days

**Outcome**

Create the 15 shared package workspaces, the shared contract boundary, and typed environment parsing.

**Acceptance criteria**

- [x] Every package typechecks and builds through Turbo.
- [x] Malformed worker environment input is rejected by a Zod schema.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0004: Add unit, integration, and browser test harnesses

- Priority: High
- Status: Done
- Depends on: MP-0001, MP-0002
- Size: 1-3 engineering days

**Outcome**

Configure Vitest, Worker request tests, and Playwright so later tickets inherit one test workflow.

**Acceptance criteria**

- [x] At least one test passes in each deployable application.
- [x] The landing-page Playwright smoke test runs against the local web server.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0005: Create pull-request CI and secret scanning

- Priority: Critical
- Status: Done
- Depends on: MP-0001, MP-0004
- Size: 1-3 engineering days

**Outcome**

Run the same frozen install, checks, tests, builds, and secret scan on every pull request.

**Acceptance criteria**

- [x] The CI workflow has least-privilege permissions and concurrency cancellation.
- [x] A branch with a type error or committed test secret fails CI.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0006: Create architecture, status, and ADR documentation

- Priority: High
- Status: Done
- Depends on: MP-0001
- Size: 1-3 engineering days

**Outcome**

Make implementation state and architectural decisions discoverable from the repository.

**Acceptance criteria**

- [x] `docs/implementation-plan.md` matches the canonical MindPay plan.
- [x] Phase status and ADR-0001 describe the three deployables and payment authority boundary.
- [x] Affected checks pass and `docs/status.md` is updated.

### MP-0007: Prove local and preview build readiness

- Priority: Critical
- Status: Done
- Depends on: MP-0002, MP-0003, MP-0004, MP-0005, MP-0006
- Size: 1-3 engineering days

**Outcome**

Close Phase 0 with a clean verification run and documented preview commands that require no committed secrets.

**Acceptance criteria**

- [x] `pnpm check` and `pnpm build` pass from a clean dependency install.
- [x] Cloudflare dry-run builds succeed for Gateway and SignalWorks; web preview configuration validates.
- [x] Affected checks pass and `docs/status.md` is updated.

## Phase completion

- [x] Every ticket above is Done.
- [x] The exit gate is demonstrated in CI or a reproducible verification record.
- [x] Architecture changes are recorded in `docs/adr/`.

