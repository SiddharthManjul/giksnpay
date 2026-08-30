import { signedMerchantCatalogSchema, signedMerchantManifestSchema } from "@mindpay/contracts";
import type { Miniflare } from "miniflare";
import { afterEach, describe, expect, it } from "vitest";
import { importSignalWorksKeyEncryptionKey, seedSignalWorksIdentity } from "./identity";
import { createMerchantApp, type MerchantBindings } from "./index";
import { seedSignalWorksMachineCredential } from "./machine-auth";
import { SIGNALWORKS_CATALOG_URL, SIGNALWORKS_MANIFEST_URL } from "./publication";
import { seedSignalWorksServiceVersions } from "./services";
import { createSignalWorksTestDatabase } from "./test-database";

const NOW = new Date("2026-08-30T12:00:00.000Z");
const KEY_ENCRYPTION_SECRET = "A".repeat(43);
const MACHINE_TOKEN = "mindpay_test_machine_token_0000000001";

const databases: Miniflare[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((miniflare) => miniflare.dispose()));
});

describe("SignalWorks repeatable seed and Gateway contract", () => {
  it("brings independent fresh databases to the same public merchant and service contract", async () => {
    const first = await seedFreshDatabase("signalworks-fresh-first");
    const second = await seedFreshDatabase("signalworks-fresh-second");

    expect(second.services).toEqual(first.services);
    expect(second.catalog.catalog).toEqual(first.catalog.catalog);
    expect(withoutKeyMaterial(second.manifest.manifest)).toEqual(
      withoutKeyMaterial(first.manifest.manifest),
    );
    expect(first.manifest.manifest.signing_keys.map((key) => [key.kid, key.purpose])).toEqual(
      second.manifest.manifest.signing_keys.map((key) => [key.kid, key.purpose]),
    );
    expect(first.machineCredential).toEqual(second.machineCredential);
  });
});

async function seedFreshDatabase(name: string) {
  const testDatabase = await createSignalWorksTestDatabase(name);
  databases.push(testDatabase.miniflare);
  const keyEncryptionKey = await importSignalWorksKeyEncryptionKey(KEY_ENCRYPTION_SECRET);
  const identity = await seedSignalWorksIdentity(testDatabase.database, keyEncryptionKey, NOW);
  const repeatedIdentity = await seedSignalWorksIdentity(
    testDatabase.database,
    keyEncryptionKey,
    new Date(NOW.getTime() + 1_000),
  );
  expect(repeatedIdentity).toEqual(identity);
  const services = await seedSignalWorksServiceVersions(testDatabase.database);
  await expect(seedSignalWorksServiceVersions(testDatabase.database)).resolves.toEqual(services);
  const machineCredential = await seedSignalWorksMachineCredential(
    testDatabase.database,
    MACHINE_TOKEN,
    NOW,
  );
  await expect(
    seedSignalWorksMachineCredential(
      testDatabase.database,
      MACHINE_TOKEN,
      new Date(NOW.getTime() + 1_000),
    ),
  ).resolves.toEqual(machineCredential);

  const bindings: MerchantBindings = {
    DB: testDatabase.database,
    ENVIRONMENT: "test",
    SIGNALWORKS_KEY_ENCRYPTION_KEY: KEY_ENCRYPTION_SECRET,
    SIGNALWORKS_MACHINE_AUTH_TOKEN: MACHINE_TOKEN,
  };
  const app = createMerchantApp({
    createCatalogNonce: () => "catalog_nonce_repeatable_0001",
    createManifestNonce: () => "manifest_nonce_repeatable_0001",
    now: () => NOW,
  });
  const manifest = signedMerchantManifestSchema.parse(
    await (await app.request(SIGNALWORKS_MANIFEST_URL, undefined, bindings)).json(),
  );
  const catalog = signedMerchantCatalogSchema.parse(
    await (await app.request(SIGNALWORKS_CATALOG_URL, undefined, bindings)).json(),
  );

  return { catalog, machineCredential, manifest, services };
}

function withoutKeyMaterial(
  manifest: ReturnType<typeof signedMerchantManifestSchema.parse>["manifest"],
) {
  const { signing_keys: _signingKeys, ...stableManifest } = manifest;
  return stableManifest;
}
