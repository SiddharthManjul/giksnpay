import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getPlatformProxy } from "wrangler";
import type { MerchantBindings } from "../src/index";
import { importSignalWorksKeyEncryptionKey, seedSignalWorksIdentity } from "../src/identity";
import { seedSignalWorksServiceVersions } from "../src/services";

const applicationRoot = fileURLToPath(new URL("../", import.meta.url));
const configPath = fileURLToPath(new URL("../wrangler.jsonc", import.meta.url));
const wranglerCommand = process.platform === "win32" ? "wrangler.cmd" : "wrangler";
const migration = spawnSync(
  wranglerCommand,
  ["d1", "migrations", "apply", "mindpay-signalworks-local", "--local", "--config", configPath],
  { cwd: applicationRoot, encoding: "utf8", stdio: "inherit" },
);

if (migration.error !== undefined) {
  throw migration.error;
}
if (migration.status !== 0) {
  process.exit(migration.status ?? 1);
}

const platform = await getPlatformProxy<MerchantBindings>({
  configPath,
  persist: true,
  remoteBindings: false,
});

try {
  const keyEncryptionKey = await importSignalWorksKeyEncryptionKey(
    process.env.SIGNALWORKS_KEY_ENCRYPTION_KEY ?? platform.env.SIGNALWORKS_KEY_ENCRYPTION_KEY,
  );
  const publicIdentity = await seedSignalWorksIdentity(platform.env.DB, keyEncryptionKey);
  const serviceVersions = await seedSignalWorksServiceVersions(platform.env.DB);
  process.stdout.write(`${JSON.stringify({ publicIdentity, serviceVersions }, null, 2)}\n`);
} finally {
  await platform.dispose();
}
