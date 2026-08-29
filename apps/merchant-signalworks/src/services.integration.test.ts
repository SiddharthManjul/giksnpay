import type { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importSignalWorksKeyEncryptionKey, seedSignalWorksIdentity } from "./identity";
import {
  SIGNALWORKS_SERVICE_VERSIONS,
  SignalWorksServiceError,
  readSignalWorksServiceVersions,
  seedSignalWorksServiceVersions,
} from "./services";
import { createSignalWorksTestDatabase } from "./test-database";

const IDENTITY_CREATED_AT = new Date("2026-08-27T00:00:00.000Z");
const KEY_ENCRYPTION_SECRET = "A".repeat(43);

describe("SignalWorks immutable service versions", () => {
  let database: D1Database;
  let miniflare: Miniflare;

  beforeEach(async () => {
    ({ database, miniflare } = await createSignalWorksTestDatabase(
      `mindpay-signalworks-services-${crypto.randomUUID()}`,
    ));
    await seedSignalWorksIdentity(
      database,
      await importSignalWorksKeyEncryptionKey(KEY_ENCRYPTION_SECRET),
      IDENTITY_CREATED_AT,
    );
  });

  afterEach(async () => {
    await miniflare.dispose();
  });

  it("seeds the same three integer-INR versions on every refresh", async () => {
    const first = await seedSignalWorksServiceVersions(database);
    const second = await seedSignalWorksServiceVersions(database);

    expect(second).toEqual(first);
    expect(first).toEqual(SIGNALWORKS_SERVICE_VERSIONS);
    expect(first.map((service) => [service.service_id, service.version])).toEqual([
      ["market_snapshot", "1.0.0"],
      ["detailed_competitor_dossier", "1.0.0"],
      ["enterprise_intelligence_pack", "1.0.0"],
    ]);
    expect(first.map((service) => service.price_subunits)).toEqual([29_900, 44_900, 79_900]);
    expect(first.every((service) => Number.isSafeInteger(service.price_subunits))).toBe(true);

    const count = await database
      .prepare("SELECT count(*) AS count FROM merchant_service_versions")
      .first<{ count: number }>();
    expect(count?.count).toBe(3);
  });

  it("rejects updates, deletes, and conflicting reinserts of a published version", async () => {
    await seedSignalWorksServiceVersions(database);

    await expect(
      database
        .prepare(
          "UPDATE merchant_service_versions SET price_subunits = 1 WHERE merchant_id = 'merchant_signalworks' AND service_id = 'market_snapshot' AND version = '1.0.0'",
        )
        .run(),
    ).rejects.toThrow(/immutable/u);
    await expect(
      database
        .prepare(
          "DELETE FROM merchant_service_versions WHERE merchant_id = 'merchant_signalworks' AND service_id = 'market_snapshot' AND version = '1.0.0'",
        )
        .run(),
    ).rejects.toThrow(/immutable/u);
    await expect(
      database
        .prepare(
          "INSERT OR REPLACE INTO merchant_service_versions SELECT merchant_id, service_id, version, name, description, category, currency, 1, availability, fulfilment_type, fulfilment_tool_id, estimated_delivery_seconds, privacy_url, terms_url, published_at, created_at FROM merchant_service_versions WHERE merchant_id = 'merchant_signalworks' AND service_id = 'market_snapshot' AND version = '1.0.0'",
        )
        .run(),
    ).rejects.toThrow(/immutable/u);

    await expect(readSignalWorksServiceVersions(database)).resolves.toEqual(
      SIGNALWORKS_SERVICE_VERSIONS,
    );
  });

  it("fails closed when a pre-existing published version conflicts with the seed", async () => {
    const reference = SIGNALWORKS_SERVICE_VERSIONS[0];
    if (reference === undefined) {
      throw new Error("Missing SignalWorks reference service");
    }
    const publishedAt = Date.parse(reference.published_at);
    await database
      .prepare(
        "INSERT INTO merchant_service_versions (merchant_id, service_id, version, name, description, category, currency, price_subunits, availability, fulfilment_type, fulfilment_tool_id, estimated_delivery_seconds, privacy_url, terms_url, published_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        reference.merchant_id,
        reference.service_id,
        reference.version,
        reference.name,
        reference.description,
        reference.category,
        reference.currency,
        1,
        reference.availability,
        reference.fulfilment.type,
        reference.fulfilment.tool_id,
        reference.fulfilment.estimated_delivery_seconds,
        reference.policy_links.privacy_url,
        reference.policy_links.terms_url,
        publishedAt,
        publishedAt,
      )
      .run();

    await expect(seedSignalWorksServiceVersions(database)).rejects.toThrow(/immutable/u);
    await expect(readSignalWorksServiceVersions(database)).rejects.toBeInstanceOf(
      SignalWorksServiceError,
    );
  });
});
