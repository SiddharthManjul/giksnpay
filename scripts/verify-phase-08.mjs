import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const verificationSteps = [
  {
    arguments: ["--filter", "@mindpay/contracts", "test"],
    label: "Strict entitlement, MCP, result, status, and signed receipt contracts",
  },
  {
    arguments: ["--filter", "@mindpay/mcp-tools", "test"],
    label: "ES256 entitlement signing, exact authority bindings, expiry, and mutation rejection",
  },
  {
    arguments: ["--filter", "@mindpay/db", "test"],
    label: "Reproducible entitlement, fulfilment, MCP rate-limit, and invocation-audit storage",
  },
  {
    arguments: [
      "--filter",
      "@mindpay/merchant-signalworks",
      "exec",
      "vitest",
      "run",
      "src/fulfilment.integration.test.ts",
      "src/mcp.integration.test.ts",
    ],
    label: "Atomic paid redemption, replay denial, schema retry, and the three-tool merchant MCP",
  },
  {
    arguments: [
      "--filter",
      "@mindpay/gateway",
      "exec",
      "vitest",
      "run",
      "src/phase-06.integration.test.ts",
      "src/mcp.integration.test.ts",
    ],
    label: "Paid issuance, failed-payment denial, verified receipt, and authenticated six-tool MCP",
  },
];

for (const [index, step] of verificationSteps.entries()) {
  process.stdout.write(`\n[Phase 8 ${index + 1}/${verificationSteps.length}] ${step.label}\n`);
  const result = spawnSync(pnpmCommand, step.arguments, {
    cwd: repositoryRoot,
    env: { ...process.env, CI: "true", NO_COLOR: "1" },
    stdio: "inherit",
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.stdout.write("\nPhase 8 entitlement and MCP fulfilment verification passed.\n");
