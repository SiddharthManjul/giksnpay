import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const verificationSteps = [
  {
    arguments: ["--filter", "@mindpay/contracts", "test"],
    label: "Shared frontend, mandate, transaction, callback, and evidence contracts",
  },
  {
    arguments: ["--filter", "@mindpay/web", "test"],
    label: "Web product and presentation invariants",
  },
  {
    arguments: [
      "--filter",
      "@mindpay/gateway",
      "exec",
      "vitest",
      "run",
      "src/agents.integration.test.ts",
      "src/agent-runs.integration.test.ts",
      "src/marketplace.integration.test.ts",
      "src/phase-06.integration.test.ts",
      "src/evidence.test.ts",
      "--maxWorkers=1",
    ],
    label: "Canonical agent-to-transaction integration and all three policy outcomes",
  },
  {
    arguments: [
      "--filter",
      "@mindpay/merchant-signalworks",
      "exec",
      "vitest",
      "run",
      "src/payments.integration.test.ts",
      "src/fulfilment.integration.test.ts",
      "--maxWorkers=1",
    ],
    label: "Razorpay callback/reconciliation and signed fulfilment integration",
  },
];

for (const [index, step] of verificationSteps.entries()) {
  process.stdout.write(`\n[Phase 10 ${index + 1}/${verificationSteps.length}] ${step.label}\n`);
  const result = spawnSync(pnpmCommand, step.arguments, {
    cwd: repositoryRoot,
    env: { ...process.env, CI: "true", NO_COLOR: "1" },
    stdio: "inherit",
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.stdout.write("\nPhase 10 frontend integration verification passed.\n");
