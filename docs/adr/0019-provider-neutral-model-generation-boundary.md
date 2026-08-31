# ADR-0019: Provider-neutral model generation boundary

- Status: Accepted
- Date: 2026-08-30

## Context

MindPay needs model-assisted agent execution without allowing a vendor SDK or unvalidated model
response to become commerce authority. The hosted runtime will later receive approved tools and
produce purchase proposals, but model text, hidden reasoning, provider metadata, and malformed JSON
must not cross into deterministic orchestration as trusted data. A provider outage must also remain
distinguishable from an invalid request or an operator configuration error.

## Decision

The agent runtime exposes a provider-neutral `ModelProvider` interface with two operations: a typed
text stream for agent runs and schema-owned structured generation. Shared inputs accept only system
instructions, user/assistant messages, bounded generation settings, and an optional abort signal.
Shared outputs contain text deltas or terminal finish/usage metadata. They do not expose raw response
bodies, reasoning events, sources, provider metadata, or vendor error messages.

The first adapter uses the AI SDK and OpenAI Responses models. Only the adapter imports those vendor
packages. The provider and model are selected from strict environment configuration; the adapter
passes the API key explicitly, disables provider-side response storage, omits reasoning summaries,
and requests strict JSON-schema output. Configuration does not accept a base-URL override, so this
ticket cannot create an arbitrary operator- or prompt-selected outbound destination.

Structured output is parsed by the AI SDK and then validated again with the caller-owned Zod schema
at the MindPay boundary. A schema/no-output failure receives exactly one new generation attempt. Only
a successfully revalidated value is returned. Repeated invalid output raises a sanitized
`InvalidStructuredModelOutputError`; other upstream faults become a sanitized provider-unavailable
error. Commerce code can therefore be called only after the promise resolves with a typed value.

The streaming adapter consumes the full provider stream but releases only non-empty text deltas and
one terminal finish event. It discards reasoning and other provider-only parts, converts explicit
abort signals to a stable abort error, and rejects streams that fail or end without terminal
metadata.

## Consequences

- Later orchestration and tool-registry work can depend on one stable interface instead of OpenAI or
  AI SDK response types.
- A malformed structured response costs at most one additional model generation before failing
  closed.
- Schemas sent to OpenAI must remain compatible with its strict JSON-schema subset; MindPay's second
  validation remains authoritative even when provider validation succeeds.
- Live provider execution requires an OpenAI API key, while deterministic tests use an injected SDK
  boundary and make no external model calls.
- Manual commerce fallback remains a separate Phase 5 ticket and will consume the stable
  provider-unavailable error.
