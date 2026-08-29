import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const verificationSteps = [
  {
    arguments: ["--filter", "@mindpay/db", "test"],
    label: "D1 migrations, constraints, owner integrity, and append-only audit events",
  },
  {
    arguments: [
      "--filter",
      "@mindpay/contracts",
      "exec",
      "vitest",
      "run",
      "src/identity.test.ts",
      "src/passkeys.test.ts",
      "src/demo-workspaces.test.ts",
    ],
    label: "Authentication, passkey, and demo-workspace input contracts",
  },
  {
    arguments: [
      "--filter",
      "@mindpay/domain",
      "exec",
      "vitest",
      "run",
      "src/organization-authorization.test.ts",
    ],
    label: "Role and capability policy",
  },
  {
    arguments: [
      "--filter",
      "@mindpay/gateway",
      "exec",
      "vitest",
      "run",
      "src/auth.test.ts",
      "src/auth.integration.test.ts",
      "src/organizations.integration.test.ts",
      "src/passkeys.integration.test.ts",
      "src/browser-security.integration.test.ts",
      "src/demo-workspaces.integration.test.ts",
    ],
    label: "Local Worker and D1 authentication and tenancy security boundary",
  },
];

for (const [index, step] of verificationSteps.entries()) {
  process.stdout.write(`\n[Phase 2 ${index + 1}/${verificationSteps.length}] ${step.label}\n`);
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

process.stdout.write("\nPhase 2 security verification passed.\n");
