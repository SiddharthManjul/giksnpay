import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const verificationSteps = [
  {
    arguments: ["--filter", "@mindpay/protocol-acp", "test"],
    label: "Pinned ACP snapshot generation and official-example conformance",
  },
  {
    arguments: ["--filter", "@mindpay/contracts", "test"],
    label: "Strict merchant, signature, and cross-party contracts",
  },
  {
    arguments: ["--filter", "@mindpay/merchant-signalworks", "test"],
    label: "SignalWorks migrations, checkout, authentication, idempotency, events, and fresh seed",
  },
];

for (const [index, step] of verificationSteps.entries()) {
  process.stdout.write(`\n[Phase 3 ${index + 1}/${verificationSteps.length}] ${step.label}\n`);
  const result = spawnSync(pnpmCommand, step.arguments, {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      CI: "true",
      NO_COLOR: "1",
    },
    stdio: "inherit",
  });

  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

process.stdout.write("\nPhase 3 merchant verification passed.\n");
