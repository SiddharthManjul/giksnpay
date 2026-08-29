import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import {
  signalWorksMerchantIdentity,
  signalWorksServiceVersions,
  signalWorksSigningKeys,
} from "./schema";

describe("SignalWorks identity schema", () => {
  it("keeps merchant identity and signing keys in the separate merchant database", () => {
    expect(getTableConfig(signalWorksMerchantIdentity).name).toBe("merchant_identity");
    expect(getTableConfig(signalWorksSigningKeys).name).toBe("merchant_signing_keys");
    expect(getTableConfig(signalWorksServiceVersions).name).toBe("merchant_service_versions");
  });

  it("declares purpose, public-key, encrypted-private-key, and lifecycle checks", () => {
    const configuration = getTableConfig(signalWorksSigningKeys);
    expect(configuration.checks.map((check) => check.name).sort()).toEqual([
      "merchant_signing_keys_created_at_valid",
      "merchant_signing_keys_id_valid",
      "merchant_signing_keys_kid_valid",
      "merchant_signing_keys_private_envelope_valid",
      "merchant_signing_keys_public_jwk_valid",
      "merchant_signing_keys_purpose_valid",
      "merchant_signing_keys_revocation_valid",
      "merchant_signing_keys_validity_window_valid",
    ]);
    expect(configuration.indexes.map((index) => index.config.name).sort()).toEqual([
      "merchant_signing_keys_active_purpose_idx",
      "merchant_signing_keys_merchant_kid_uq",
    ]);
  });

  it("declares immutable service-version value and catalog lookup constraints", () => {
    const configuration = getTableConfig(signalWorksServiceVersions);
    expect(configuration.checks.map((check) => check.name).sort()).toEqual([
      "merchant_service_versions_availability_valid",
      "merchant_service_versions_category_valid",
      "merchant_service_versions_currency_valid",
      "merchant_service_versions_delivery_valid",
      "merchant_service_versions_description_valid",
      "merchant_service_versions_fulfilment_type_valid",
      "merchant_service_versions_name_valid",
      "merchant_service_versions_policy_origins_valid",
      "merchant_service_versions_price_valid",
      "merchant_service_versions_service_id_valid",
      "merchant_service_versions_timestamps_valid",
      "merchant_service_versions_tool_id_valid",
      "merchant_service_versions_version_valid",
    ]);
    expect(configuration.indexes.map((index) => index.config.name)).toEqual([
      "merchant_service_versions_catalog_idx",
    ]);
    expect(configuration.primaryKeys).toHaveLength(1);
  });
});
