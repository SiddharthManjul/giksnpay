import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const verificationSteps = [
  {
    arguments: ["--filter", "@mindpay/audit", "test"],
    label: "Canonical redaction, hash links, and ES256 audit signatures",
  },
  {
    arguments: ["--filter", "@mindpay/db", "test"],
    label: "Reproducible append-only audit and evidence storage",
  },
  {
    arguments: [
      "--filter",
      "@mindpay/gateway",
      "exec",
      "vitest",
      "run",
      "src/evidence.test.ts",
      "src/audit.integration.test.ts",
      "src/phase-06.integration.test.ts",
      "--maxWorkers=1",
    ],
    label: "Portable tamper tests plus success, block, and payment-failure evidence",
  },
];

for (const [index, step] of verificationSteps.entries()) {
  process.stdout.write(`\n[Phase 9 ${index + 1}/${verificationSteps.length}] ${step.label}\n`);
  const result = spawnSync(pnpmCommand, step.arguments, {
    cwd: repositoryRoot,
    env: { ...process.env, CI: "true", NO_COLOR: "1" },
    stdio: "inherit",
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.stdout.write("\nPhase 9 signed audit and public evidence verification passed.\n");
