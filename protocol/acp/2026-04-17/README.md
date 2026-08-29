# ACP 2026-04-17 snapshot

This directory vendors the official Agentic Commerce Protocol (ACP) `2026-04-17` release for
MindPay. The source is pinned to immutable upstream commit
[`7fdd78df677a94dce04c770644b0fbbb1401272b`](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol/tree/7fdd78df677a94dce04c770644b0fbbb1401272b).
It contains the dated OpenAPI, JSON Schema, OpenRPC, official example, changelog, and license
artifacts only. It does not contain `main`, `unreleased`, or a floating package dependency.

The dated release was created by upstream commit `9abf303f48088d170503a54502d612b8b1997897`.
The pinned artifacts include upstream's official post-release fixes through commit
`17adf494cf8b4bcb41967a0386188b8103316d2f`. See `PROVENANCE.json` for the complete record.

## Integrity

Run this command from the repository root:

```sh
shasum -a 256 -c protocol/acp/2026-04-17/CHECKSUMS.sha256
```

Every official artifact must report `OK`. `README.md`, `PROVENANCE.json`, and
`CHECKSUMS.sha256` are MindPay metadata and are intentionally excluded from the upstream artifact
checksum list.

## Generated boundary

`@mindpay/protocol-acp` generates TypeScript contracts from the vendored JSON Schemas and validates
conformance fixtures against these exact files. Regenerate through the package script; never edit
generated files or replace files in this directory manually.

Do not place a newer ACP release or floating ACP artifact under this pinned path.
