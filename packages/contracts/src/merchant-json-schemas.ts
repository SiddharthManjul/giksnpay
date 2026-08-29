import { z } from "zod";
import {
  merchantCatalogSchema,
  merchantCheckoutSchema,
  merchantManifestSchema,
  merchantOfferSchema,
  serviceVersionSchema,
} from "./merchant";

const SCHEMA_BASE_URL = "https://schemas.mindpay.dev/merchant/v1";

export const merchantManifestJsonSchema = createJsonSchema(
  merchantManifestSchema,
  `${SCHEMA_BASE_URL}/manifest.schema.json`,
);

export const serviceVersionJsonSchema = createJsonSchema(
  serviceVersionSchema,
  `${SCHEMA_BASE_URL}/service-version.schema.json`,
);

export const merchantCatalogJsonSchema = createJsonSchema(
  merchantCatalogSchema,
  `${SCHEMA_BASE_URL}/catalog.schema.json`,
);

export const merchantOfferJsonSchema = createJsonSchema(
  merchantOfferSchema,
  `${SCHEMA_BASE_URL}/offer.schema.json`,
);

export const merchantCheckoutJsonSchema = createJsonSchema(
  merchantCheckoutSchema,
  `${SCHEMA_BASE_URL}/checkout.schema.json`,
);

function createJsonSchema(schema: z.ZodType, id: string): Readonly<Record<string, unknown>> {
  return Object.freeze({
    ...z.toJSONSchema(schema, { target: "draft-2020-12" }),
    $id: id,
  });
}
