# Phase 5 verification

- Date: 2026-08-30
- Result: Pass
- External credentials required: None for deterministic verification

## Agent-runtime boundaries verified

| Boundary | Evidence |
|---|---|
| Immutable identity | Organization-scoped agents publish immutable policy, model configuration, specialization, public signing identity, and typed tool bindings; the private JWK remains A256GCM-wrapped |
| Provider isolation | One provider-neutral interface exposes validated structured output and text-only streams; provider reasoning and raw errors do not cross the adapter |
| Closed tools | The registry contains exactly six reviewed version IDs; URL fetch, shell, raw database, policy mutation, and payment execution fail before a supplied handler runs |
| Permission scopes | Search, lookup, signed offer, and proposal independently enforce the published category allowlist and maximum price |
| Canonical commerce | Verified D1 marketplace and signed-catalog state own service, merchant, amount, currency, terms, and recipient; model and merchant prose are never selection authority |
| Procurement outcome | “Buy the best competitor research under ₹400” selects the current ₹299 SignalWorks market snapshot; injected merchant instructions cannot select a tool, payee, or higher-priced offer |
| Durable evidence | Runs retain bounded summaries and proposals; tool calls retain typed I/O, hashes, latency, version, stable errors, and terminal status; events are contiguous and append-only |
| Idempotent writes | AI and manual runs require a key; exact retries return the stored run without another model/tool call and changed requests conflict |
| Reasoning privacy | The provider boundary omits reasoning and the run, tool-call, event, and proposal contracts contain no hidden-reasoning field |
| Reconnectable progress | SSE resumes with `Last-Event-ID` or `after`, replays stored sequence IDs, and ends with an instruction to refetch canonical state |
| State authority | Injected model-text events cannot advance a run, create a transaction, or alter the canonical proposal |
| Manual fallback | Provider outage closes explicitly, while marketplace discovery, manual verified selection, deterministic proposal creation, and evidence retrieval remain available |
| Evaluations | Fifty deterministic synthetic intents cover ten propose, reject, and defer-to-policy classes |

## Reproducible exit suite

`pnpm verify:phase-05` runs five fail-fast layers:

1. canonical agent-key and live-model environment configuration;
2. strict agent, tool, run, event, signed-offer, and proposal contracts;
3. encrypted key handling, provider isolation, registry denial, procurement selection, timeouts, and
   50-case evaluations;
4. reproducible D1 schema plus publication, bound-tool, terminal-evidence, and append-only sequence
   integrity attacks; and
5. real Better Auth, Hono, Miniflare, D1, marketplace, AI-run, SSE resume, organization isolation,
   provider-outage, and manual-fallback integration tests.

The live Google Gemini and optional OpenAI adapters compile against pinned SDKs but are replaced by
deterministic providers in most tests, so the exit suite makes no external network call and needs no
API key. A live default AI run requires `GOOGLE_GENERATIVE_AI_API_KEY`; an absent or unavailable
provider leaves the manual path usable.

## Verified commands

| Command | Result | Proves |
|---|---|---|
| `pnpm verify:phase-05` | Pass | Focused Phase 5 trust boundaries, persistence, procurement, streaming, and fallback |
| `pnpm check` | Pass | Formatting, lint, strict typecheck, and all repository tests |
| `pnpm build` | Pass | All application and package production builds |
| `git diff --check` | Pass | No malformed patch whitespace |

## Architecture record

ADR-0018 records immutable agent versions and encrypted signing keys. ADR-0019 records the
provider-neutral generation boundary. ADR-0020 records canonical commerce authority, the closed
tool registry, append-only run evidence, non-authoritative streams, and deterministic manual
fallback.

## Result

The Phase 5 exit gate is satisfied: published agents are immutable, see only explicitly approved
typed tools, cannot fetch arbitrary URLs or execute payments, select and explain a valid canonical
proposal despite merchant prompt injection, persist auditable run evidence without hidden reasoning,
resume progress safely, and retain manual commerce when AI is unavailable.
