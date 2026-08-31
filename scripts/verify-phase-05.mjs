import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const verificationSteps = [
  {
    arguments: ["--filter", "@mindpay/config", "test"],
    label: "Canonical agent-key and model-provider configuration",
  },
  {
    arguments: ["--filter", "@mindpay/contracts", "test"],
    label: "Strict agent, tool, run, event, offer, and proposal contracts",
  },
  {
    arguments: ["--filter", "@mindpay/agent-runtime", "test"],
    label: "Encrypted keys, model boundary, approved tools, procurement, and 50 intent evals",
  },
  {
    arguments: ["--filter", "@mindpay/db", "test"],
    label: "Reproducible agent, bound-tool evidence, and append-only run persistence",
  },
  {
    arguments: ["--filter", "@mindpay/gateway", "test"],
    label: "AI procurement, resumable events, manual fallback, and Gateway regressions",
  },
];

for (const [index, step] of verificationSteps.entries()) {
  process.stdout.write(`\n[Phase 5 ${index + 1}/${verificationSteps.length}] ${step.label}\n`);
  const result = spawnSync(pnpmCommand, step.arguments, {
    cwd: repositoryRoot,
    env: { ...process.env, CI: "true", NO_COLOR: "1" },
    stdio: "inherit",
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.stdout.write("\nPhase 5 agent verification passed.\n");
