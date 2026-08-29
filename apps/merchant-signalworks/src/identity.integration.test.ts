import {
  type Es256KeyUnavailableError,
  bytesToBase64Url,
  importEs256PublicJwk,
  verifyCanonicalJsonEs256,
} from "@mindpay/crypto";
import { es256PublicJwkSchema } from "@mindpay/contracts";
import type { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SIGNALWORKS_MERCHANT,
  SIGNALWORKS_SIGNING_PURPOSES,
  SignalWorksIdentityError,
  importSignalWorksKeyEncryptionKey,
  readSignalWorksPublicIdentity,
  revokeSignalWorksSigningKey,
  rotateSignalWorksSigningKey,
  seedSignalWorksIdentity,
  signSignalWorksPayload,
  signSignalWorksPayloadWithKey,
} from "./identity";
import { createSignalWorksTestDatabase } from "./test-database";

const NOW = new Date("2026-08-29T12:00:00.000Z");
const KEY_ENCRYPTION_SECRET = "A".repeat(43);

describe("SignalWorks merchant identity and signing-key lifecycle", () => {
  let database: D1Database;
  let keyEncryptionKey: CryptoKey;
  let miniflare: Miniflare;

  beforeEach(async () => {
    ({ database, miniflare } = await createSignalWorksTestDatabase(
      `mindpay-signalworks-identity-${crypto.randomUUID()}`,
    ));
    keyEncryptionKey = await importSignalWorksKeyEncryptionKey(KEY_ENCRYPTION_SECRET);
  });

  afterEach(async () => {
    await miniflare.dispose();
  });

  it("seeds one stable merchant and four separate purpose keys idempotently", async () => {
    const first = await seedSignalWorksIdentity(database, keyEncryptionKey, NOW);
    const second = await seedSignalWorksIdentity(
      database,
      keyEncryptionKey,
      new Date(NOW.getTime() + 60_000),
    );

    expect(second).toEqual(first);
    expect(first.merchant).toEqual({
      domain: SIGNALWORKS_MERCHANT.domain,
      merchant_id: SIGNALWORKS_MERCHANT.merchantId,
      name: SIGNALWORKS_MERCHANT.name,
    });
    expect(first.signingKeys).toHaveLength(4);
    expect(new Set(first.signingKeys.flatMap((key) => key.purpose))).toEqual(
      new Set(SIGNALWORKS_SIGNING_PURPOSES),
    );
    expect(first.signingKeys.every((key) => key.purpose.length === 1)).toBe(true);
    expect(JSON.stringify(first)).not.toMatch(/encrypted|private|ciphertext|"d"/u);

    const identityCount = await database
      .prepare("SELECT count(*) AS count FROM merchant_identity")
      .first<{ count: number }>();
    const keyCount = await database
      .prepare("SELECT count(*) AS count FROM merchant_signing_keys")
      .first<{ count: number }>();
    expect(identityCount?.count).toBe(1);
    expect(keyCount?.count).toBe(4);

    const storedKeys = await database
      .prepare("SELECT public_jwk, encrypted_private_jwk FROM merchant_signing_keys")
      .all<{ encrypted_private_jwk: string; public_jwk: string }>();
    for (const row of storedKeys.results) {
      expect(JSON.parse(row.public_jwk)).not.toHaveProperty("d");
      expect(JSON.parse(row.encrypted_private_jwk)).toMatchObject({
        algorithm: "A256GCM",
        version: 1,
      });
    }
  });

  it("converges concurrent seed executions on the same stored identity", async () => {
    const [first, second] = await Promise.all([
      seedSignalWorksIdentity(database, keyEncryptionKey, NOW),
      seedSignalWorksIdentity(database, keyEncryptionKey, NOW),
    ]);

    expect(second).toEqual(first);
    const keyCount = await database
      .prepare("SELECT count(*) AS count FROM merchant_signing_keys")
      .first<{ count: number }>();
    expect(keyCount?.count).toBe(4);
  });

  it("fails a repeated seed immediately when the wrapping secret does not match", async () => {
    await seedSignalWorksIdentity(database, keyEncryptionKey, NOW);
    const wrongKey = await importSignalWorksKeyEncryptionKey(
      bytesToBase64Url(new Uint8Array(32).fill(1)),
    );

    await expect(seedSignalWorksIdentity(database, wrongKey, NOW)).rejects.toThrow();
    await expect(readSignalWorksPublicIdentity(database)).resolves.toMatchObject({
      merchant: { merchant_id: SIGNALWORKS_MERCHANT.merchantId },
      signingKeys: expect.arrayContaining([expect.objectContaining({ purpose: ["manifest"] })]),
    });
  });

  it("signs each payload only with the key assigned to its purpose", async () => {
    const identity = await seedSignalWorksIdentity(database, keyEncryptionKey, NOW);

    for (const purpose of SIGNALWORKS_SIGNING_PURPOSES) {
      const payload = { purpose, value: "SignalWorks test" };
      const signature = await signSignalWorksPayload(
        database,
        keyEncryptionKey,
        purpose,
        payload,
        NOW.getTime(),
      );
      const publicRecord = identity.signingKeys.find((key) => key.kid === signature.kid);
      expect(publicRecord?.purpose).toEqual([purpose]);
      if (publicRecord === undefined) {
        throw new Error(`Missing public key for ${purpose}`);
      }
      const publicKey = await importEs256PublicJwk(publicRecord.public_jwk);
      await expect(
        verifyCanonicalJsonEs256(
          payload,
          signature,
          [
            {
              kid: publicRecord.kid,
              publicKey,
              validFromEpochMs: Date.parse(publicRecord.valid_from),
            },
          ],
          NOW.getTime(),
        ),
      ).resolves.toEqual({ kid: publicRecord.kid, valid: true });
    }
  });

  it("persists revocation metadata and prevents the revoked key from signing", async () => {
    const identity = await seedSignalWorksIdentity(database, keyEncryptionKey, NOW);
    const manifestKey = identity.signingKeys.find((key) => key.purpose.includes("manifest"));
    if (manifestKey === undefined) {
      throw new Error("Missing manifest signing key");
    }
    const revokedAt = new Date(NOW.getTime() + 1_000);
    const revoked = await revokeSignalWorksSigningKey(database, manifestKey.kid, revokedAt);
    expect(revoked.revoked_at).toBe(revokedAt.toISOString());
    await expect(
      revokeSignalWorksSigningKey(database, manifestKey.kid, revokedAt),
    ).resolves.toEqual(revoked);

    await expect(
      signSignalWorksPayloadWithKey(
        database,
        keyEncryptionKey,
        manifestKey.kid,
        { manifest: true },
        revokedAt.getTime(),
      ),
    ).rejects.toMatchObject({ reason: "REVOKED_KEY" } satisfies Partial<Es256KeyUnavailableError>);
    await expect(
      signSignalWorksPayload(
        database,
        keyEncryptionKey,
        "manifest",
        { manifest: true },
        revokedAt.getTime(),
      ),
    ).rejects.toThrow(/No active SignalWorks manifest signing key/u);
    await expect(readSignalWorksPublicIdentity(database)).resolves.toMatchObject({
      signingKeys: expect.arrayContaining([
        expect.objectContaining({ kid: manifestKey.kid, revoked_at: revokedAt.toISOString() }),
      ]),
    });
  });

  it("rotates one purpose with an explicit overlap and retires the previous key", async () => {
    const identity = await seedSignalWorksIdentity(database, keyEncryptionKey, NOW);
    const original = identity.signingKeys.find((key) => key.purpose.includes("manifest"));
    if (original === undefined) {
      throw new Error("Missing manifest signing key");
    }
    const validFrom = new Date(NOW.getTime() + 1_000);
    const oldValidUntil = new Date(NOW.getTime() + 2_000);
    const rotatedIdentity = await rotateSignalWorksSigningKey(
      database,
      keyEncryptionKey,
      {
        currentKid: original.kid,
        newKid: "signalworks.manifest.2026-02",
        oldValidUntil,
        purpose: "manifest",
        validFrom,
      },
      NOW,
    );
    const rotated = rotatedIdentity.signingKeys.find(
      (key) => key.kid === "signalworks.manifest.2026-02",
    );
    expect(rotated?.valid_from).toBe(validFrom.toISOString());
    expect(rotatedIdentity.signingKeys.find((key) => key.kid === original.kid)?.valid_until).toBe(
      oldValidUntil.toISOString(),
    );

    const overlapTime = validFrom.getTime() + 1;
    await expect(
      signSignalWorksPayloadWithKey(
        database,
        keyEncryptionKey,
        original.kid,
        { overlap: true },
        overlapTime,
      ),
    ).resolves.toMatchObject({ kid: original.kid });
    await expect(
      signSignalWorksPayload(
        database,
        keyEncryptionKey,
        "manifest",
        { overlap: true },
        overlapTime,
      ),
    ).resolves.toMatchObject({ kid: rotated?.kid });
    await expect(
      signSignalWorksPayloadWithKey(
        database,
        keyEncryptionKey,
        original.kid,
        { retired: true },
        oldValidUntil.getTime(),
      ),
    ).rejects.toMatchObject({ reason: "EXPIRED_KEY" });
  });

  it("rejects private public-JWK material, unknown purposes, and inverted lifecycle windows", async () => {
    await seedSignalWorksIdentity(database, keyEncryptionKey, NOW);
    const row = await database
      .prepare(
        "SELECT public_jwk, encrypted_private_jwk FROM merchant_signing_keys WHERE purpose = 'manifest'",
      )
      .first<{ encrypted_private_jwk: string; public_jwk: string }>();
    if (row === null) {
      throw new Error("Missing stored manifest key");
    }
    const publicJwk = es256PublicJwkSchema.parse(JSON.parse(row.public_jwk) as unknown);
    const commonBindings = [SIGNALWORKS_MERCHANT.merchantId, NOW.getTime(), NOW.getTime()] as const;

    await expect(
      database
        .prepare(
          "INSERT INTO merchant_signing_keys (id, merchant_id, kid, purpose, public_jwk, encrypted_private_jwk, valid_from, created_at) VALUES ('mkey_invalid_private', ?, 'invalid.private', 'event', ?, ?, ?, ?)",
        )
        .bind(
          commonBindings[0],
          JSON.stringify({ ...publicJwk, d: "private-coordinate" }),
          row.encrypted_private_jwk,
          commonBindings[1],
          commonBindings[2],
        )
        .run(),
    ).rejects.toThrow();
    await expect(
      database
        .prepare(
          "INSERT INTO merchant_signing_keys (id, merchant_id, kid, purpose, public_jwk, encrypted_private_jwk, valid_from, created_at) VALUES ('mkey_invalid_purpose', ?, 'invalid.purpose', 'refund', ?, ?, ?, ?)",
        )
        .bind(
          commonBindings[0],
          row.public_jwk,
          row.encrypted_private_jwk,
          commonBindings[1],
          commonBindings[2],
        )
        .run(),
    ).rejects.toThrow();
    await expect(
      database
        .prepare(
          "INSERT INTO merchant_signing_keys (id, merchant_id, kid, purpose, public_jwk, encrypted_private_jwk, valid_from, valid_until, created_at) VALUES ('mkey_invalid_window', ?, 'invalid.window', 'event', ?, ?, ?, ?, ?)",
        )
        .bind(
          commonBindings[0],
          row.public_jwk,
          row.encrypted_private_jwk,
          NOW.getTime(),
          NOW.getTime(),
          NOW.getTime(),
        )
        .run(),
    ).rejects.toThrow();
  });

  it("fails closed when a pre-existing identity conflicts with the stable seed", async () => {
    await database
      .prepare(
        "INSERT INTO merchant_identity (id, name, legal_name, domain, status, created_at) VALUES (?, 'Impostor', 'Impostor Legal Name', ?, 'ACTIVE', ?)",
      )
      .bind(SIGNALWORKS_MERCHANT.merchantId, SIGNALWORKS_MERCHANT.domain, NOW.getTime())
      .run();

    await expect(seedSignalWorksIdentity(database, keyEncryptionKey, NOW)).rejects.toBeInstanceOf(
      SignalWorksIdentityError,
    );
  });
});
