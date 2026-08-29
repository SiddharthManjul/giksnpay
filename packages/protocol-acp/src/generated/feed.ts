/**
 * Generated from the vendored official ACP 2026-04-17 JSON Schema.
 * Source: protocol/acp/2026-04-17/spec/json-schema/schema.feed.json
 * Source SHA-256: 5ef3eea431f6a860bb810793843018c8ea5b8c17aa60420ad66ebec3575189c4
 * Do not edit by hand. Run `pnpm --filter @mindpay/protocol-acp generate`.
 */

/**
 * Extensible list of applicable item conditions, such as new or secondhand.
 *
 * This interface was referenced by `FeedSchemaBundle`'s JSON-Schema
 * via the `definition` "Condition".
 *
 * Items: Condition label supplied by the merchant.
 */
export type Condition = string[];
/**
 * Extensible list of conditions applicable to this variant.
 *
 * Items: Condition label supplied by the merchant.
 */
export type Condition1 = string[];

export interface FeedSchemaBundle {
  [k: string]: unknown | undefined;
}
/**
 * Structured long-form or rich-text description content for a product or variant.
 *
 * This interface was referenced by `FeedSchemaBundle`'s JSON-Schema
 * via the `definition` "Description".
 */
export interface Description {
  /**
   * Plain-text description intended for clients that do not render rich formatting.
   */
  plain?: string;
  /**
   * HTML-formatted description content.
   */
  html?: string;
  /**
   * Markdown-formatted description content.
   */
  markdown?: string;
}
/**
 * Monetary amount expressed in minor units with an associated ISO 4217 currency code.
 *
 * This interface was referenced by `FeedSchemaBundle`'s JSON-Schema
 * via the `definition` "Price".
 */
export interface Price {
  /**
   * Monetary amount expressed in ISO 4217 minor units.
   */
  amount: number;
  /**
   * Three-letter ISO 4217 currency identifier.
   */
  currency: string;
}
/**
 * Purchasability and fulfillment state for a variant.
 *
 * This interface was referenced by `FeedSchemaBundle`'s JSON-Schema
 * via the `definition` "Availability".
 */
export interface Availability {
  /**
   * Indicates whether the variant is currently purchasable. Use status for fulfillment context.
   */
  available?: boolean;
  /**
   * Extensible fulfillment state for the variant. Known values include in_stock, limited_stock, backorder, preorder, out_of_stock, and discontinued.
   */
  status?: string;
}
/**
 * Machine-readable identifier attached to a variant, such as a GTIN or UPC.
 *
 * This interface was referenced by `FeedSchemaBundle`'s JSON-Schema
 * via the `definition` "Barcode".
 */
export interface Barcode {
  /**
   * Barcode scheme or identifier type, such as GTIN, UPC, or EAN.
   */
  type: string;
  /**
   * Raw barcode value as provided by the merchant.
   */
  value: string;
}
/**
 * Media asset associated with a product or variant.
 *
 * This interface was referenced by `FeedSchemaBundle`'s JSON-Schema
 * via the `definition` "Media".
 */
export interface Media {
  /**
   * Media kind, such as image, video, or model.
   */
  type: string;
  /**
   * Canonical URL where the media asset can be retrieved.
   */
  url: string;
  /**
   * Human-readable alternate text describing the asset.
   */
  alt_text?: string;
  /**
   * Rendered width of the asset in pixels, when known.
   */
  width?: number;
  /**
   * Rendered height of the asset in pixels, when known.
   */
  height?: number;
}
/**
 * One selected characteristic of a variant, such as size or color.
 *
 * This interface was referenced by `FeedSchemaBundle`'s JSON-Schema
 * via the `definition` "VariantOption".
 */
export interface VariantOption {
  /**
   * Display name of the option dimension, such as Color or Size.
   */
  name: string;
  /**
   * Selected option value for this variant.
   */
  value: string;
}
/**
 * Category assignment for a product or variant within a specific taxonomy.
 *
 * This interface was referenced by `FeedSchemaBundle`'s JSON-Schema
 * via the `definition` "Category".
 */
export interface Category {
  /**
   * Category label or hierarchical path, for example Mens > Sweaters > Crewnecks.
   */
  value: string;
  /**
   * Names the taxonomy system used for the category value, such as google_product_category, shopify, or merchant.
   */
  taxonomy?: string;
}
/**
 * Merchant-provided informational or policy link associated with a seller.
 *
 * This interface was referenced by `FeedSchemaBundle`'s JSON-Schema
 * via the `definition` "Link".
 */
export interface Link {
  /**
   * Extensible link type, such as privacy_policy, terms_of_service, refund_policy, shipping_policy, or faq.
   */
  type: string;
  /**
   * Human-readable label for the linked resource.
   */
  title?: string;
  /**
   * Canonical URL for the linked resource.
   */
  url: string;
}
/**
 * Merchant or seller identity associated with a variant offer.
 *
 * This interface was referenced by `FeedSchemaBundle`'s JSON-Schema
 * via the `definition` "Seller".
 */
export interface Seller {
  /**
   * Display name of the seller or merchant of record.
   */
  name?: string;
  /**
   * Informational or policy links associated with this seller.
   */
  links?: Link[];
}
/**
 * Measured quantity paired with a unit for unit-price calculations.
 *
 * This interface was referenced by `FeedSchemaBundle`'s JSON-Schema
 * via the `definition` "Measure".
 */
export interface Measure {
  /**
   * Measured quantity for the package or item.
   */
  value: number;
  /**
   * Unit label for the measured quantity, such as oz, ml, or kg.
   */
  unit: string;
}
/**
 * Reference unit used when normalizing a unit price for display.
 *
 * This interface was referenced by `FeedSchemaBundle`'s JSON-Schema
 * via the `definition` "ReferenceMeasure".
 */
export interface ReferenceMeasure {
  /**
   * Reference quantity used to normalize the unit price.
   */
  value: number;
  /**
   * Reference unit label, such as ml, g, or oz.
   */
  unit: string;
}
/**
 * Normalized unit price for products sold by weight, volume, or measure.
 *
 * This interface was referenced by `FeedSchemaBundle`'s JSON-Schema
 * via the `definition` "UnitPrice".
 */
export interface UnitPrice {
  /**
   * Normalized price amount expressed in ISO 4217 minor units.
   */
  amount: number;
  /**
   * Three-letter ISO 4217 currency identifier.
   */
  currency: string;
  measure: Measure1;
  reference: ReferenceMeasure1;
}
/**
 * Actual packaged measure associated with the sale item.
 */
export interface Measure1 {
  /**
   * Measured quantity for the package or item.
   */
  value: number;
  /**
   * Unit label for the measured quantity, such as oz, ml, or kg.
   */
  unit: string;
}
/**
 * Reference measure used to display the normalized unit price.
 */
export interface ReferenceMeasure1 {
  /**
   * Reference quantity used to normalize the unit price.
   */
  value: number;
  /**
   * Reference unit label, such as ml, g, or oz.
   */
  unit: string;
}
/**
 * Purchasable variant of a product within a feed.
 *
 * This interface was referenced by `FeedSchemaBundle`'s JSON-Schema
 * via the `definition` "Variant".
 */
export interface Variant {
  /**
   * Stable global identifier for this variant.
   */
  id: string;
  /**
   * Display title for the variant.
   */
  title: string;
  description?: Description1;
  /**
   * Canonical URL for the variant detail page.
   */
  url?: string;
  /**
   * Machine-readable identifiers associated with this variant.
   */
  barcodes?: Barcode[];
  price?: Price1;
  list_price?: Price2;
  unit_price?: UnitPrice1;
  availability?: Availability1;
  /**
   * Category assignments associated with this variant.
   */
  categories?: Category[];
  condition?: Condition1;
  /**
   * Option selections that distinguish this variant, such as Color: Red or Size: Small.
   */
  variant_options?: VariantOption[];
  /**
   * Media assets specific to this variant. The first item is the primary listing asset.
   */
  media?: Media[];
  seller?: Seller1;
  marketplace?: Seller2;
}
/**
 * Structured description content for the variant.
 */
export interface Description1 {
  /**
   * Plain-text description intended for clients that do not render rich formatting.
   */
  plain?: string;
  /**
   * HTML-formatted description content.
   */
  html?: string;
  /**
   * Markdown-formatted description content.
   */
  markdown?: string;
}
/**
 * Active selling price for the variant.
 */
export interface Price1 {
  /**
   * Monetary amount expressed in ISO 4217 minor units.
   */
  amount: number;
  /**
   * Three-letter ISO 4217 currency identifier.
   */
  currency: string;
}
/**
 * Reference or pre-discount price for the variant.
 */
export interface Price2 {
  /**
   * Monetary amount expressed in ISO 4217 minor units.
   */
  amount: number;
  /**
   * Three-letter ISO 4217 currency identifier.
   */
  currency: string;
}
/**
 * Normalized unit price, when applicable.
 */
export interface UnitPrice1 {
  /**
   * Normalized price amount expressed in ISO 4217 minor units.
   */
  amount: number;
  /**
   * Three-letter ISO 4217 currency identifier.
   */
  currency: string;
  measure: Measure1;
  reference: ReferenceMeasure1;
}
/**
 * Purchasability and fulfillment state for the variant.
 */
export interface Availability1 {
  /**
   * Indicates whether the variant is currently purchasable. Use status for fulfillment context.
   */
  available?: boolean;
  /**
   * Extensible fulfillment state for the variant. Known values include in_stock, limited_stock, backorder, preorder, out_of_stock, and discontinued.
   */
  status?: string;
}
/**
 * Seller or merchant of record for this variant.
 */
export interface Seller1 {
  /**
   * Display name of the seller or merchant of record.
   */
  name?: string;
  /**
   * Informational or policy links associated with this seller.
   */
  links?: Link[];
}
/**
 * Marketplace or intermediary platform through which this variant is offered, if applicable.
 */
export interface Seller2 {
  /**
   * Display name of the seller or merchant of record.
   */
  name?: string;
  /**
   * Informational or policy links associated with this seller.
   */
  links?: Link[];
}
/**
 * Catalog product grouping one or more purchasable variants within a feed.
 *
 * This interface was referenced by `FeedSchemaBundle`'s JSON-Schema
 * via the `definition` "Product".
 */
export interface Product {
  /**
   * Stable global identifier for this product.
   */
  id: string;
  /**
   * Display title for the product.
   */
  title?: string;
  description?: Description2;
  /**
   * Canonical URL for the product detail page.
   */
  url?: string;
  /**
   * Media assets associated with the product.
   */
  media?: Media[];
  /**
   * Purchasable variants grouped under this product.
   */
  variants: Variant[];
}
/**
 * Structured description content for the product.
 */
export interface Description2 {
  /**
   * Plain-text description intended for clients that do not render rich formatting.
   */
  plain?: string;
  /**
   * HTML-formatted description content.
   */
  html?: string;
  /**
   * Markdown-formatted description content.
   */
  markdown?: string;
}
/**
 * Server-managed metadata describing a feed resource.
 *
 * This interface was referenced by `FeedSchemaBundle`'s JSON-Schema
 * via the `definition` "FeedMetadata".
 */
export interface FeedMetadata {
  /**
   * Stable identifier for the feed resource.
   */
  id: string;
  /**
   * Optional ISO 3166-1 alpha-2 country code describing the feed's target market.
   */
  target_country?: string;
  /**
   * Timestamp of the most recent update applied to this feed.
   */
  updated_at?: string;
}
/**
 * Request payload used to create a feed.
 *
 * This interface was referenced by `FeedSchemaBundle`'s JSON-Schema
 * via the `definition` "CreateFeedRequest".
 */
export interface CreateFeedRequest {
  /**
   * Optional ISO 3166-1 alpha-2 country code describing the feed's target market.
   */
  target_country?: string;
}
/**
 * Response envelope containing the current product set for a feed.
 *
 * This interface was referenced by `FeedSchemaBundle`'s JSON-Schema
 * via the `definition` "ProductsResponse".
 */
export interface ProductsResponse {
  /**
   * Full list of products currently associated with the feed.
   */
  products: Product[];
}
/**
 * Request payload that partially upserts products into a feed. Products omitted from the request remain unchanged.
 *
 * This interface was referenced by `FeedSchemaBundle`'s JSON-Schema
 * via the `definition` "UpsertProductsRequest".
 */
export interface UpsertProductsRequest {
  /**
   * Subset of products to create or update within the feed, matched by Product.id.
   */
  products: Product[];
}
/**
 * Structured error returned when a feed request cannot be fulfilled.
 *
 * This interface was referenced by `FeedSchemaBundle`'s JSON-Schema
 * via the `definition` "Error".
 */
export interface Error {
  /**
   * High-level error category.
   */
  type: string;
  /**
   * Machine-readable error code for programmatic handling.
   */
  code: string;
  /**
   * Human-readable explanation of the error.
   */
  message: string;
  /**
   * Optional request parameter or field associated with the error.
   */
  param?: string;
}
