import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const verificationSteps = [
  {
    arguments: ["--filter", "@mindpay/domain", "test"],
    label: "Reviewer capability and verification-state policy",
  },
  {
    arguments: ["--filter", "@mindpay/contracts", "test"],
    label: "Strict manifest, catalog, marketplace, and failure-reason contracts",
  },
  {
    arguments: ["--filter", "@mindpay/db", "test"],
    label: "Canonical marketplace D1 schema, immutability, and migration reproducibility",
  },
  {
    arguments: ["--filter", "@mindpay/gateway", "test"],
    label: "Onboarding, verification, quarantine, indexing, KV coherence, and discovery APIs",
  },
];

for (const [index, step] of verificationSteps.entries()) {
  process.stdout.write(`\n[Phase 4 ${index + 1}/${verificationSteps.length}] ${step.label}\n`);
  const result = spawnSync(pnpmCommand, step.arguments, {
    cwd: repositoryRoot,
    env: { ...process.env, CI: "true", NO_COLOR: "1" },
    stdio: "inherit",
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.stdout.write("\nPhase 4 marketplace verification passed.\n");
