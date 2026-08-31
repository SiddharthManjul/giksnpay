import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const verificationSteps = [
  {
    arguments: ["--filter", "@mindpay/protocol-mandates", "test"],
    label: "AP2-aligned open/closed constraint mapping and agent signatures",
  },
  {
    arguments: ["--filter", "@mindpay/policy-engine", "test"],
    label: "Stable deterministic policy order, price gate, budget properties, and state machine",
  },
  {
    arguments: ["--filter", "@mindpay/risk-engine", "test"],
    label: "Versioned deterministic block/review authority and evidence-only model signals",
  },
  {
    arguments: ["--filter", "@mindpay/db", "test"],
    label: "Tenant-bound proofs plus atomic reserve, release, commit, expiry, and race enforcement",
  },
  {
    arguments: [
      "--filter",
      "@mindpay/gateway",
      "exec",
      "vitest",
      "run",
      "src/phase-06.integration.test.ts",
    ],
    label:
      "Mandate lifecycle, exact WebAuthn step-up, idempotency, revocation, and ₹299/₹449/₹799 exit gate",
  },
];

for (const [index, step] of verificationSteps.entries()) {
  process.stdout.write(`\n[Phase 6 ${index + 1}/${verificationSteps.length}] ${step.label}\n`);
  const result = spawnSync(pnpmCommand, step.arguments, {
    cwd: repositoryRoot,
    env: { ...process.env, CI: "true", NO_COLOR: "1" },
    stdio: "inherit",
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.stdout.write("\nPhase 6 mandate and policy verification passed.\n");
