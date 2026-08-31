import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const verificationSteps = [
  {
    arguments: ["--filter", "@mindpay/razorpay", "test"],
    label: "Typed REST errors, redaction, HMAC, webhook parsing, and strict reconciliation",
  },
  {
    arguments: ["--filter", "@mindpay/contracts", "test"],
    label: "Closed payment authority, public-only Checkout config, and captured+paid contracts",
  },
  {
    arguments: ["--filter", "@mindpay/config", "test"],
    label: "Test Mode credential validation and disabled-by-default feature flags",
  },
  {
    arguments: ["--filter", "@mindpay/db", "test"],
    label: "Reproducible payment-attempt migration and exactly-once budget reserve/commit/release",
  },
  {
    arguments: [
      "--filter",
      "@mindpay/merchant-signalworks",
      "exec",
      "vitest",
      "run",
      "src/payments.integration.test.ts",
    ],
    label:
      "SignalWorks order, callback, raw webhook, duplicate, queue, and out-of-order integration",
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
      "Reserved-only order creation, signed capture/failure, budget closure, and bounded retry",
  },
];

for (const [index, step] of verificationSteps.entries()) {
  process.stdout.write(`\n[Phase 7 ${index + 1}/${verificationSteps.length}] ${step.label}\n`);
  const result = spawnSync(pnpmCommand, step.arguments, {
    cwd: repositoryRoot,
    env: { ...process.env, CI: "true", NO_COLOR: "1" },
    stdio: "inherit",
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.stdout.write("\nPhase 7 deterministic Razorpay boundary verification passed.\n");
