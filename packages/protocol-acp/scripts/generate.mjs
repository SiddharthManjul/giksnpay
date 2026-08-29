import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { compileFromFile } from "json-schema-to-typescript";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");
const schemaRoot = resolve(repositoryRoot, "protocol/acp/2026-04-17/spec/json-schema");
const outputRoot = resolve(packageRoot, "src/generated");
const checkOnly = process.argv.includes("--check");

const schemas = [
  ["agenticCheckout", "schema.agentic_checkout.json", "agentic-checkout.ts"],
  ["cart", "schema.cart.json", "cart.ts"],
  ["delegateAuthentication", "schema.delegate_authentication.json", "delegate-authentication.ts"],
  ["delegatePayment", "schema.delegate_payment.json", "delegate-payment.ts"],
  ["discount", "schema.discount.json", "discount.ts"],
  ["extension", "schema.extension.json", "extension.ts"],
  ["feed", "schema.feed.json", "feed.ts"],
];

const generated = new Map();
const bundles = [];

for (const [bundleName, sourceFile, outputFile] of schemas) {
  const sourcePath = resolve(schemaRoot, sourceFile);
  const source = await readFile(sourcePath, "utf8");
  const sourceHash = createHash("sha256").update(source).digest("hex");
  const bannerComment = [
    "/**",
    " * Generated from the vendored official ACP 2026-04-17 JSON Schema.",
    ` * Source: protocol/acp/2026-04-17/spec/json-schema/${sourceFile}`,
    ` * Source SHA-256: ${sourceHash}`,
    " * Do not edit by hand. Run `pnpm --filter @mindpay/protocol-acp generate`.",
    " */",
  ].join("\n");
  const typeSource = await compileFromFile(sourcePath, {
    bannerComment,
    cwd: schemaRoot,
    enableConstEnums: false,
    strictIndexSignatures: true,
    unknownAny: true,
    unreachableDefinitions: true,
  });

  const typeSourceWithoutComments = typeSource
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/\/\/.*$/gmu, "");
  if (/\bany\b/u.test(typeSourceWithoutComments)) {
    throw new Error(`${outputFile} contains an explicit any type`);
  }

  generated.set(resolve(outputRoot, outputFile), typeSource);
  bundles.push([bundleName, sourceFile, sourceHash, JSON.parse(source)]);
}

const bundleNames = bundles.map(([bundleName]) => JSON.stringify(bundleName)).join(" | ");
const bundleEntries = bundles
  .map(
    ([bundleName, sourceFile, sourceHash, schema]) =>
      `  ${bundleName}: ${JSON.stringify(schema, null, 2)},\n` +
      `  // ${sourceFile} SHA-256: ${sourceHash}`,
  )
  .join("\n");
const bundleSource = `/**
 * Generated from the vendored official ACP 2026-04-17 JSON Schemas.
 * Do not edit by hand. Run \`pnpm --filter @mindpay/protocol-acp generate\`.
 */

export type AcpSchemaBundleName = ${bundleNames};

export const acpSchemaBundles: Readonly<
  Record<AcpSchemaBundleName, Readonly<Record<string, unknown>>>
> = Object.freeze({
${bundleEntries}
});
`;
generated.set(resolve(outputRoot, "schema-bundles.ts"), bundleSource);

await mkdir(outputRoot, { recursive: true });

const stale = [];
for (const [outputPath, contents] of generated) {
  const current = await readFile(outputPath, "utf8").catch(() => undefined);
  if (current === contents) {
    continue;
  }
  if (checkOnly) {
    stale.push(outputPath);
    continue;
  }
  await writeFile(outputPath, contents, "utf8");
}

if (stale.length > 0) {
  const relativePaths = stale.map((file) => file.slice(repositoryRoot.length + 1));
  throw new Error(`Generated ACP files are stale:\n${relativePaths.join("\n")}`);
}

console.log(checkOnly ? "ACP generated files are current." : "Generated ACP TypeScript contracts.");
