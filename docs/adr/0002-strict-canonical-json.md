# ADR-0002: Strict RFC 8785 canonical JSON boundary

- Status: Accepted
- Date: 2026-08-28
- Owners: MindPay engineering

## Context

MindPay signs and hashes objects exchanged between the Gateway, merchants, agents, and public
verification surfaces. Ordinary `JSON.stringify` depends on object insertion order and silently
coerces or omits several JavaScript values. That behavior would let two participants derive
different bytes from data that appears equivalent, or sign less data than a caller supplied.

## Decision

Use an in-repository RFC 8785-compatible serializer as the only route from structured data to
signed or hashed bytes. It uses ECMAScript binary64 number serialization, sorts object keys by raw
UTF-16 code units, validates Unicode scalar pairs, and emits UTF-8 with `TextEncoder`.

The serializer accepts only finite numbers, strings with valid surrogate pairs, booleans, null,
dense arrays, and plain objects. It rejects cycles, sparse arrays, accessors, symbol or hidden
properties, non-JSON primitives, and class or built-in instances. Repeated non-cyclic references
are allowed because they still have an unambiguous JSON representation.

## Consequences

- Every signature and digest can be reproduced from the same logical JSON value across MindPay
  participants.
- Callers must convert dates, maps, classes, and optional `undefined` values into validated
  protocol data before signing.
- Invalid Unicode and values that `JSON.stringify` would silently omit fail before cryptographic
  operations.
- The implementation remains Worker-compatible and has no Node.js crypto or serialization
  dependency.

## Alternatives considered

- Plain `JSON.stringify` was rejected because insertion order affects output and unsupported values
  can be omitted or coerced.
- A permissive pre-normalization pass was rejected because it can hide caller mistakes at a trust
  boundary.
- A runtime canonicalization dependency was deferred because the required algorithm is small,
  testable, and must remain stable for long-lived evidence verification.

## Verification

- The RFC 8785 serialization and UTF-16 property-order examples are covered by golden tests.
- Property tests prove insertion-order independence and parse/canonicalize idempotence.
- Adversarial tests cover invalid numbers and Unicode, accessors, hidden data, sparse arrays,
  non-plain objects, and cycles.
