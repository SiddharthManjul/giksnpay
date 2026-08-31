# Phase 5 MP-0501 verification

- Date: 2026-08-30
- Ticket result: Pass
- Phase result: In progress
- External credentials required: None

## Boundaries verified

| Boundary | Evidence |
|---|---|
| Tenancy | Agent list, detail, version, and publication queries bind both the authenticated membership and selected organization; inaccessible IDs return the same 404 as missing IDs |
| Authorization | `agent:read` permits VIEWER reads; `agent:write` permits BUILDER mutations and rejects VIEWER writes |
| Input and replay | Strict contracts reject unknown input; every mutation requires a bounded idempotency key and canonical request hash; exact retries replay the stored response and changed requests conflict |
| Signing identity | Agent creation generates ES256, returns only the strict public JWK, and stores the private JWK only inside an A256GCM envelope |
| Secret boundary | The runtime accepts only canonical 32-byte base64url configuration; wrong secrets and changed agent context fail authenticated decryption; invalid configuration performs zero agent writes |
| Publication | Policy and configuration share an immutable version row; D1 rejects published-version update/delete and bound-tool insert/update/delete attempts |
| Current pointer | D1 accepts only a published version owned by the agent as `current_version_id` |
| Migration integrity | Seven migrations reproduce 27 tables and 22 integrity triggers across independent local D1 databases |

## Reproducible suite

`pnpm verify:phase-05` runs configuration, shared contract, agent runtime, D1 migration/integrity,
and complete Gateway regression suites. The focused integration creates a real authenticated
organization-scoped agent, decrypts its stored key only with the configured secret, verifies that
serialized API output contains no private or encrypted key fields, publishes a version with a tool
binding, and attacks every immutability trigger through direct D1 statements.

ADR-0018 records the version-publication and private-key boundary. MP-0501 is complete; the Phase 5
exit gate remains open until MP-0502 through MP-0507 are complete.

## Verified commands

| Command | Result |
|---|---|
| `pnpm verify:phase-05` | Pass |
| `pnpm check` | Pass |
| `pnpm build` | Pass |
| `git diff --check` | Pass |
