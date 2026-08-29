/**
 * Generated from the vendored official ACP 2026-04-17 JSON Schema.
 * Source: protocol/acp/2026-04-17/spec/json-schema/schema.discount.json
 * Source SHA-256: 792ca48fca11bd1363ce0c5c74aa42b1f5fd5ba5eb3adb8582a4bef872c092ae
 * Do not edit by hand. Run `pnpm --filter @mindpay/protocol-acp generate`.
 */

/**
 * Error codes for rejected discount codes, used in messages[].code.
 *
 * This interface was referenced by `DiscountExtension`'s JSON-Schema
 * via the `definition` "discount_error_codes".
 */
export type DiscountErrorCodes =
  | "discount_code_expired"
  | "discount_code_invalid"
  | "discount_code_already_applied"
  | "discount_code_combination_disallowed"
  | "discount_code_minimum_not_met"
  | "discount_code_user_not_logged_in"
  | "discount_code_user_ineligible"
  | "discount_code_usage_limit_reached";
/**
 * Checkout session extended with discount capability.
 *
 * This interface was referenced by `DiscountExtension`'s JSON-Schema
 * via the `definition` "checkout_with_discount".
 */
export type CheckoutWithDiscountExtension = CheckoutSessionBase & {
  discounts?: DiscountsResponse2;
  [k: string]: unknown | undefined;
};
/**
 * Checkout session create request extended with discount codes.
 *
 * This interface was referenced by `DiscountExtension`'s JSON-Schema
 * via the `definition` "checkout_create_request_with_discount".
 */
export type CheckoutCreateRequestWithDiscountExtension = CheckoutSessionCreateRequest & {
  discounts?: DiscountsRequest2;
  [k: string]: unknown | undefined;
};
/**
 * Affiliate attribution data for first-touch tracking
 */
export type AffiliateAttribution = {
  [k: string]: unknown | undefined;
} & {
  /**
   * Identifier for the attribution provider / affiliate network namespace (e.g., 'impact.com').
   */
  provider: string;
  /**
   * Opaque provider-issued token for fraud-resistant validation. Treat as secret.
   */
  token?: string;
  /**
   * Provider-scoped affiliate/publisher identifier. Required if token is omitted.
   */
  publisher_id?: string;
  /**
   * Provider-scoped campaign identifier.
   */
  campaign_id?: string;
  /**
   * Provider-scoped creative identifier.
   */
  creative_id?: string;
  /**
   * Provider-scoped sub-tracking identifier.
   */
  sub_id?: string;
  source?: AffiliateAttributionSource;
  /**
   * RFC3339 timestamp when the attribution token was issued.
   */
  issued_at?: string;
  /**
   * RFC3339 timestamp when the attribution token expires.
   */
  expires_at?: string;
  metadata?: AffiliateAttributionMetadata;
  /**
   * Attribution touchpoint type. Use 'first' when capturing at session creation, 'last' when capturing at completion. Enables multi-touch attribution models.
   */
  touchpoint?: "first" | "last";
  [k: string]: unknown | undefined;
};
/**
 * Checkout session update request extended with discount codes.
 *
 * This interface was referenced by `DiscountExtension`'s JSON-Schema
 * via the `definition` "checkout_update_request_with_discount".
 */
export type CheckoutUpdateRequestWithDiscountExtension = CheckoutSessionUpdateRequest & {
  discounts?: DiscountsRequest4;
  [k: string]: unknown | undefined;
};

/**
 * Extends Checkout with discount code support, enabling agents to apply promotional, loyalty, referral, and other discount codes. Version: 2026-01-27.
 */
export interface DiscountExtension {
  [k: string]: unknown | undefined;
}
/**
 * Breakdown of how a discount amount was allocated to a specific target.
 *
 * This interface was referenced by `DiscountExtension`'s JSON-Schema
 * via the `definition` "allocation".
 */
export interface Allocation {
  /**
   * JSONPath to the allocation target (e.g., '$.line_items[0]', '$.totals.shipping').
   */
  path: string;
  /**
   * Amount allocated to this target in minor (cents) currency units.
   */
  amount: number;
}
/**
 * Coupon details describing the discount terms.
 *
 * This interface was referenced by `DiscountExtension`'s JSON-Schema
 * via the `definition` "coupon".
 */
export interface Coupon {
  /**
   * Unique identifier for the coupon.
   */
  id: string;
  /**
   * Human-readable coupon name (e.g., 'Summer Sale 20% Off').
   */
  name: string;
  /**
   * Percentage discount (0-100). Mutually exclusive with amount_off.
   */
  percent_off?: number;
  /**
   * Fixed discount amount in minor currency units. Mutually exclusive with percent_off.
   */
  amount_off?: number;
  /**
   * ISO 4217 currency code for amount_off. Required if amount_off is set.
   */
  currency?: string;
  /**
   * How long the discount applies. 'once' = single use, 'repeating' = multiple billing periods, 'forever' = indefinitely.
   */
  duration?: "once" | "repeating" | "forever";
  /**
   * Number of months the coupon applies if duration is 'repeating'.
   */
  duration_in_months?: number;
  /**
   * Maximum number of times this coupon can be redeemed across all customers.
   */
  max_redemptions?: number;
  /**
   * Number of times this coupon has been redeemed.
   */
  times_redeemed?: number;
  /**
   * Arbitrary key-value metadata attached to the coupon.
   */
  metadata?: {
    /**
     * Metadata value
     */
    [k: string]: string | undefined;
  };
}
/**
 * A discount that was successfully applied to the checkout session.
 *
 * This interface was referenced by `DiscountExtension`'s JSON-Schema
 * via the `definition` "applied_discount".
 */
export interface AppliedDiscount {
  /**
   * Unique identifier for this applied discount instance.
   */
  id: string;
  /**
   * The discount code entered by the user. Omitted for automatic discounts.
   */
  code?: string;
  coupon: Coupon1;
  /**
   * Total discount amount in minor (cents) currency units.
   */
  amount: number;
  /**
   * True if applied automatically by merchant rules (no code required).
   */
  automatic?: boolean;
  /**
   * RFC 3339 timestamp when the discount became active.
   */
  start?: string;
  /**
   * RFC 3339 timestamp when the discount expires.
   */
  end?: string;
  /**
   * Allocation method. 'each' = applied independently per item (allocations typically included). 'across' = applied to order total (allocations typically omitted).
   */
  method?: "each" | "across";
  /**
   * Stacking order for discount calculation. Lower numbers applied first (1 = first).
   */
  priority?: number;
  /**
   * Breakdown of where this discount was allocated. Sum of allocation amounts equals total amount.
   */
  allocations?: Allocation[];
}
/**
 * Details about the underlying coupon/promotion.
 */
export interface Coupon1 {
  /**
   * Unique identifier for the coupon.
   */
  id: string;
  /**
   * Human-readable coupon name (e.g., 'Summer Sale 20% Off').
   */
  name: string;
  /**
   * Percentage discount (0-100). Mutually exclusive with amount_off.
   */
  percent_off?: number;
  /**
   * Fixed discount amount in minor currency units. Mutually exclusive with percent_off.
   */
  amount_off?: number;
  /**
   * ISO 4217 currency code for amount_off. Required if amount_off is set.
   */
  currency?: string;
  /**
   * How long the discount applies. 'once' = single use, 'repeating' = multiple billing periods, 'forever' = indefinitely.
   */
  duration?: "once" | "repeating" | "forever";
  /**
   * Number of months the coupon applies if duration is 'repeating'.
   */
  duration_in_months?: number;
  /**
   * Maximum number of times this coupon can be redeemed across all customers.
   */
  max_redemptions?: number;
  /**
   * Number of times this coupon has been redeemed.
   */
  times_redeemed?: number;
  /**
   * Arbitrary key-value metadata attached to the coupon.
   */
  metadata?: {
    /**
     * Metadata value
     */
    [k: string]: string | undefined;
  };
}
/**
 * A discount code that could not be applied, with the reason.
 *
 * This interface was referenced by `DiscountExtension`'s JSON-Schema
 * via the `definition` "rejected_discount".
 */
export interface RejectedDiscount {
  /**
   * The discount code that was rejected.
   */
  code: string;
  /**
   * Error code indicating why the discount was rejected.
   */
  reason:
    | "discount_code_expired"
    | "discount_code_invalid"
    | "discount_code_already_applied"
    | "discount_code_combination_disallowed"
    | "discount_code_minimum_not_met"
    | "discount_code_user_not_logged_in"
    | "discount_code_user_ineligible"
    | "discount_code_usage_limit_reached";
  /**
   * Human-readable explanation of why the code was rejected.
   */
  message?: string;
}
/**
 * Discount codes input for checkout create/update requests.
 *
 * This interface was referenced by `DiscountExtension`'s JSON-Schema
 * via the `definition` "discounts_request".
 */
export interface DiscountsRequest {
  /**
   * Discount codes to apply. Case-insensitive. Replaces previously submitted codes. Send empty array to clear.
   *
   * Items: Discount code to apply
   */
  codes?: string[];
}
/**
 * Discount codes input, applied discounts, and rejected codes in checkout responses.
 *
 * This interface was referenced by `DiscountExtension`'s JSON-Schema
 * via the `definition` "discounts_response".
 */
export interface DiscountsResponse {
  /**
   * Echo of submitted discount codes.
   *
   * Items: Discount code submitted
   */
  codes?: string[];
  /**
   * Discounts successfully applied (code-based and automatic).
   */
  applied?: AppliedDiscount[];
  /**
   * Discount codes that could not be applied, with reasons.
   */
  rejected?: RejectedDiscount[];
}
/**
 * Base checkout session model containing common fields for all checkout session states
 */
export interface CheckoutSessionBase {
  /**
   * Unique identifier for the checkout session
   */
  id: string;
  protocol?: ProtocolVersion;
  capabilities: Capabilities;
  buyer?: Buyer;
  /**
   * Current status of the checkout session
   */
  status:
    | "incomplete"
    | "not_ready_for_payment"
    | "requires_escalation"
    | "authentication_required"
    | "ready_for_payment"
    | "pending_approval"
    | "complete_in_progress"
    | "completed"
    | "canceled"
    | "in_progress"
    | "expired";
  /**
   * ISO 4217 settlement currency code
   */
  currency: string;
  /**
   * ISO 4217 presentment currency code if different from settlement currency
   */
  presentment_currency?: string;
  /**
   * Exchange rate from presentment to settlement currency
   */
  exchange_rate?: number;
  /**
   * RFC 3339 timestamp when exchange rate was determined
   */
  exchange_rate_timestamp?: string;
  /**
   * Locale code (e.g., 'en-US') for localizing content
   */
  locale?: string;
  /**
   * IANA timezone identifier (e.g., 'America/New_York')
   */
  timezone?: string;
  /**
   * Line items in the checkout session
   */
  line_items: LineItem[];
  fulfillment_details?: FulfillmentDetails;
  /**
   * Available fulfillment options
   */
  fulfillment_options: (
    FulfillmentOptionShipping | FulfillmentOptionDigital | FulfillmentOptionPickup | FulfillmentOptionLocalDelivery
  )[];
  /**
   * Currently selected fulfillment options
   */
  selected_fulfillment_options?: SelectedFulfillmentOption[];
  /**
   * Optional grouping of line items by fulfillment method
   */
  fulfillment_groups?: FulfillmentGroup[];
  /**
   * Cart-level totals breakdown
   */
  totals: Total[];
  /**
   * Messages to communicate with the buyer (info, warnings, errors)
   */
  messages: (MessageInfo | MessageWarning | MessageError)[];
  /**
   * Relevant links (terms, policies, support)
   */
  links: Link[];
  authentication_metadata?: AuthenticationMetadata;
  /**
   * RFC 3339 timestamp when the session was created
   */
  created_at?: string;
  /**
   * RFC 3339 timestamp of last update
   */
  updated_at?: string;
  /**
   * RFC 3339 timestamp when the session expires
   */
  expires_at?: string;
  /**
   * URL to continue or resume the checkout session
   */
  continue_url?: string;
  /**
   * Arbitrary metadata for merchant use
   */
  metadata?: {
    [k: string]: unknown | undefined;
  };
  /**
   * Quote identifier if this session is based on a quote
   */
  quote_id?: string;
  /**
   * RFC 3339 timestamp when the quote expires
   */
  quote_expires_at?: string;
  discounts?: DiscountsResponse1;
  /**
   * Marketing consent options the seller offers. When present, the agent SHOULD display these to the buyer before checkout completion. Agents MAY selectively surface a subset of options; options not surfaced MUST be omitted from marketing_consents in the complete request. When absent, the agent MUST NOT surface any marketing consent UI. An empty array is equivalent to absent.
   */
  marketing_consent_options?: MarketingConsentOption[];
  order?: Order;
}
/**
 * Protocol version metadata
 */
export interface ProtocolVersion {
  /**
   * ACP protocol version in YYYY-MM-DD format.
   */
  version: string;
}
/**
 * Negotiated capabilities between agent and seller
 */
export interface Capabilities {
  payment?: Payment;
  interventions?: InterventionCapabilities;
  /**
   * Extensions supported by the party. Requests: array of extension identifiers. Responses: array of extension declaration objects.
   */
  extensions?: string[] | ExtensionDeclaration[];
}
/**
 * Payment configuration with handlers
 */
export interface Payment {
  /**
   * Available payment handlers
   */
  handlers: PaymentHandler[];
}
/**
 * Payment handler configuration and capabilities
 */
export interface PaymentHandler {
  /**
   * Seller-defined handler identifier
   */
  id: string;
  /**
   * Handler name in reverse-DNS format (e.g., dev.acp.tokenized.card)
   */
  name: string;
  /**
   * Human-readable name for UI (e.g., Credit Card). Use when showing payment options to the buyer.
   */
  display_name?: string;
  /**
   * Handler version in YYYY-MM-DD format
   */
  version: string;
  /**
   * URL to handler specification
   */
  spec: string;
  /**
   * Whether this handler requires using delegate_payment API
   */
  requires_delegate_payment: boolean;
  /**
   * Whether this handler routes PCI DSS sensitive data
   */
  requires_pci_compliance: boolean;
  /**
   * Payment Service Provider identifier
   */
  psp: string;
  /**
   * URL to JSON Schema for handler configuration
   */
  config_schema: string;
  /**
   * URLs to JSON Schemas for payment instruments
   *
   * Items: URL to a JSON Schema defining accepted payment instrument format
   */
  instrument_schemas: string[];
  /**
   * Handler-specific configuration
   */
  config: {
    [k: string]: unknown | undefined;
  };
  /**
   * Optional merchant-suggested display order (lower = higher preference). Suggestive only; platform/agent MAY reorder.
   */
  display_order?: number;
}
/**
 * Intervention capabilities. Context-specific fields: display_context, redirect_context, max_redirects, max_interaction_depth (requests only). required, enforcement (responses only). supported field contains intersection in responses.
 */
export interface InterventionCapabilities {
  /**
   * Intervention types supported. Agent request: Interventions the agent can handle. Seller response: Intersection of supported interventions.
   */
  supported?: ("3ds" | "biometric" | "address_verification")[];
  /**
   * Intervention methods required for this session (seller only).
   */
  required?: ("3ds" | "biometric")[];
  /**
   * When required interventions are enforced (seller only).
   */
  enforcement?: "always" | "conditional" | "optional";
  /**
   * How the Agent presents interventions (agent only).
   */
  display_context?: "native" | "webview" | "modal" | "redirect";
  /**
   * How the Agent handles redirects (agent only).
   */
  redirect_context?: "in_app" | "external_browser" | "none";
  /**
   * Maximum number of redirects the Agent can handle (agent only).
   */
  max_redirects?: number;
  /**
   * Maximum depth of nested interactions the Agent can handle (agent only).
   */
  max_interaction_depth?: number;
}
/**
 * Extension declaration in capabilities.extensions (response). Describes an active extension and which schema fields it adds.
 */
export interface ExtensionDeclaration {
  /**
   * Unique identifier for the extension.
   */
  name: string;
  /**
   * JSONPath expressions identifying the schema fields added by this extension. Format: $.<SchemaName>.<fieldName> (e.g., $.CheckoutSession.discounts).
   *
   * Items: JSONPath expression identifying a schema field added by this extension
   */
  extends?: string[];
  /**
   * URL to the extension's JSON Schema definition.
   */
  schema?: string;
  /**
   * URL to the extension's specification document.
   */
  spec?: string;
}
/**
 * Buyer information
 */
export interface Buyer {
  /**
   * Buyer's first name
   */
  first_name?: string;
  /**
   * Buyer's last name
   */
  last_name?: string;
  /**
   * Buyer's full name
   */
  full_name?: string;
  /**
   * Buyer's email address
   */
  email: string;
  /**
   * Buyer's phone number
   */
  phone_number?: string;
  /**
   * Merchant's internal customer identifier
   */
  customer_id?: string;
  /**
   * Type of buyer account
   */
  account_type?: "guest" | "registered" | "business";
  /**
   * Buyer's authentication status
   */
  authentication_status?: "authenticated" | "guest" | "requires_signin";
  company?: CompanyInfo;
  loyalty?: LoyaltyInfo;
  tax_exemption?: TaxExemption;
}
/**
 * Company information for business buyers
 */
export interface CompanyInfo {
  /**
   * Company or organization name
   */
  name: string;
  /**
   * Business tax identification number
   */
  tax_id?: string;
  /**
   * Department within the organization
   */
  department?: string;
  /**
   * Cost center code for internal accounting
   */
  cost_center?: string;
}
/**
 * Loyalty program information
 */
export interface LoyaltyInfo {
  /**
   * Loyalty program tier level
   */
  tier?: string;
  /**
   * Current loyalty points balance
   */
  points_balance?: number;
  /**
   * RFC 3339 timestamp when the customer joined the loyalty program
   */
  member_since?: string;
}
/**
 * Tax exemption details
 */
export interface TaxExemption {
  /**
   * Unique identifier for the tax exemption certificate
   */
  certificate_id: string;
  /**
   * Type of tax exemption certificate
   */
  certificate_type: "resale" | "exempt_organization" | "government";
  /**
   * List of regions where the exemption applies (e.g., state codes)
   *
   * Items: Region code where tax exemption applies (e.g., state abbreviation)
   */
  exempt_regions?: string[];
  /**
   * RFC 3339 timestamp when the exemption certificate expires
   */
  expires_at?: string;
}
/**
 * A line item in the checkout representing a product with pricing, discounts, and fulfillment details
 */
export interface LineItem {
  /**
   * Unique identifier for the line item
   */
  id: string;
  item: Item;
  /**
   * Number of units for this line item
   */
  quantity: number;
  /**
   * Display name of the line item
   */
  name?: string;
  /**
   * Detailed description of the line item
   */
  description?: string;
  /**
   * Array of image URLs for this line item
   *
   * Items: Image URL for the product
   */
  images?: string[];
  /**
   * The unit price of the line item in the smallest currency unit (e.g., cents for USD)
   */
  unit_amount?: number;
  /**
   * Legal disclosures or disclaimers for this item
   */
  disclosures?: Disclosure[];
  /**
   * Custom attributes specific to this line item
   */
  custom_attributes?: CustomAttribute[];
  marketplace_seller_details?: MarketplaceSellerDetails;
  /**
   * Merchant's product identifier
   */
  product_id?: string;
  /**
   * Stock keeping unit identifier
   */
  sku?: string;
  /**
   * Product variant identifier
   */
  variant_id?: string;
  /**
   * Product category
   */
  category?: string;
  /**
   * Product tags or labels
   *
   * Items: Product tag or category
   */
  tags?: string[];
  weight?: WeightInfo;
  dimensions?: DimensionsInfo;
  /**
   * Current availability status of the item
   */
  availability_status?: "in_stock" | "low_stock" | "out_of_stock" | "backorder" | "pre_order";
  /**
   * Quantity currently available for purchase
   */
  available_quantity?: number;
  /**
   * Maximum quantity allowed per order
   */
  max_quantity_per_order?: number;
  /**
   * RFC 3339 timestamp when item becomes available for fulfillment
   */
  fulfillable_on?: string;
  /**
   * Selected product variant options (e.g., size, color)
   */
  variant_options?: VariantOption[];
  /**
   * Line-item level discount details
   */
  discount_details?: DiscountDetail[];
  /**
   * Whether this line item is tax exempt
   */
  tax_exempt?: boolean;
  /**
   * Reason for tax exemption if applicable
   */
  tax_exemption_reason?: string;
  /**
   * Reference to parent line item for bundled products
   */
  parent_id?: string;
  /**
   * Line-item level totals breakdown including base_amount, discount, subtotal, tax, and total
   */
  totals: Total[];
}
/**
 * Reference to the item being purchased
 */
export interface Item {
  /**
   * Unique identifier for the item
   */
  id: string;
  /**
   * Display name of the item
   */
  name?: string;
  /**
   * Price per unit in minor currency units (e.g. 100 cents for $1.00 or 100 for ¥100)
   */
  unit_amount?: number;
}
/**
 * Legal disclosure or terms that must be acknowledged by the buyer
 */
export interface Disclosure {
  /**
   * Type of disclosure
   */
  type: "disclaimer";
  /**
   * Format of the disclosure content. When set to 'markdown', content MUST conform to CommonMark (https://spec.commonmark.org/0.31.2/). Raw HTML elements MUST NOT be included. When set to 'plain', content is plain text with no formatting.
   */
  content_type: "plain" | "markdown";
  /**
   * The disclosure text content. When content_type is 'markdown', this MUST be valid CommonMark with no raw HTML. Agents MUST render using a CommonMark-compliant parser with raw HTML output disabled or sanitized.
   */
  content: string;
}
/**
 * Custom key-value attribute for merchant-specific metadata on line items
 */
export interface CustomAttribute {
  /**
   * Human-readable label for the attribute
   */
  display_name: string;
  /**
   * Attribute value
   */
  value: string;
}
/**
 * Seller details for marketplace items
 */
export interface MarketplaceSellerDetails {
  /**
   * Name of the marketplace seller or vendor
   */
  name: string;
}
/**
 * Weight information for the item
 */
export interface WeightInfo {
  /**
   * Numeric weight value
   */
  value: number;
  /**
   * Unit of measurement for weight
   */
  unit: "g" | "kg" | "oz" | "lb";
}
/**
 * Dimensions for the item
 */
export interface DimensionsInfo {
  /**
   * Length dimension
   */
  length: number;
  /**
   * Width dimension
   */
  width: number;
  /**
   * Height dimension
   */
  height: number;
  /**
   * Unit of measurement for dimensions
   */
  unit: "cm" | "in";
}
/**
 * Represents a single variant option for a product (e.g., size, color, material)
 */
export interface VariantOption {
  /**
   * Variant attribute name (e.g., 'Size', 'Color')
   */
  name: string;
  /**
   * Variant attribute value (e.g., 'Large', 'Blue')
   */
  value: string;
}
/**
 * Information about a discount applied to the checkout or a specific item
 */
export interface DiscountDetail {
  /**
   * Discount code if applicable
   */
  code?: string;
  /**
   * Type of discount
   */
  type: "percentage" | "fixed" | "bogo" | "volume";
  /**
   * Discount amount in minor currency units (e.g. 100 cents for $1.00 or 100 for ¥100)
   */
  amount: number;
  /**
   * Human-readable discount description
   */
  description?: string;
  /**
   * Source of the discount
   */
  source?: "coupon" | "automatic" | "loyalty";
}
/**
 * Total amounts for the checkout including subtotal, discounts, tax, shipping, and final total
 */
export interface Total {
  /**
   * Type of total line item
   */
  type:
    | "items_base_amount"
    | "items_discount"
    | "subtotal"
    | "discount"
    | "fulfillment"
    | "tax"
    | "fee"
    | "gift_wrap"
    | "tip"
    | "store_credit"
    | "total"
    | "amount_refunded";
  /**
   * Localized display text for this total
   */
  display_text: string;
  /**
   * Amount in minor currency units (e.g. 100 cents for $1.00 or 100 for ¥100)
   */
  amount: number;
  /**
   * Amount in presentment currency minor units if different from settlement currency
   */
  presentment_amount?: number;
  /**
   * Additional descriptive text for this total
   */
  description?: string;
  /**
   * Detailed breakdown for tax totals
   */
  breakdown?: TaxBreakdownItem[];
}
/**
 * Breakdown of tax amounts by type, jurisdiction, or rate
 */
export interface TaxBreakdownItem {
  /**
   * Tax jurisdiction name (e.g., 'California State Tax', 'City of San Francisco')
   */
  jurisdiction: string;
  /**
   * Tax rate as a decimal (e.g., 0.0875 for 8.75%)
   */
  rate: number;
  /**
   * Tax amount in minor currency units (e.g. 100 cents for $1.00 or 100 for ¥100)
   */
  amount: number;
}
/**
 * Fulfillment contact and address details
 */
export interface FulfillmentDetails {
  /**
   * Full name for fulfillment contact
   */
  name?: string;
  /**
   * Contact phone number. E.164 format recommended (e.g., +15551234567) for global interoperability and SMS/delivery carrier systems.
   */
  phone_number?: string;
  /**
   * Contact email address
   */
  email?: string;
  address?: Address;
}
/**
 * Fulfillment address
 */
export interface Address {
  /**
   * Recipient name for this address
   */
  name: string;
  /**
   * Primary street address line
   */
  line_one: string;
  /**
   * Secondary address line (apartment, suite, etc.)
   */
  line_two?: string;
  /**
   * City name
   */
  city: string;
  /**
   * State or province code
   */
  state: string;
  /**
   * ISO 3166-1 alpha-2 country code
   */
  country: string;
  /**
   * Postal or ZIP code
   */
  postal_code: string;
  /**
   * Postal or ZIP code
   */
  company?: string;
}
/**
 * Shipping fulfillment option with carrier, service level, and delivery estimates
 */
export interface FulfillmentOptionShipping {
  /**
   * Fulfillment type discriminator
   */
  type: "shipping";
  /**
   * Unique identifier for this fulfillment option
   */
  id: string;
  /**
   * Display title for this shipping option (e.g., 'Standard Shipping', 'Express')
   */
  title: string;
  /**
   * Additional details about this shipping option
   */
  description?: string;
  /**
   * Shipping carrier name (e.g., 'USPS', 'FedEx')
   */
  carrier?: string;
  /**
   * RFC 3339 timestamp for earliest expected delivery
   */
  earliest_delivery_time?: string;
  /**
   * RFC 3339 timestamp for latest expected delivery
   */
  latest_delivery_time?: string;
  /**
   * Cost breakdown for this fulfillment option
   */
  totals: Total[];
}
/**
 * Digital delivery fulfillment option for downloadable or streaming content
 */
export interface FulfillmentOptionDigital {
  /**
   * Fulfillment type discriminator
   */
  type: "digital";
  /**
   * Unique identifier for this fulfillment option
   */
  id: string;
  /**
   * Display title for this digital delivery option
   */
  title: string;
  /**
   * Additional details about digital delivery method
   */
  description?: string;
  /**
   * Cost breakdown for this fulfillment option
   */
  totals: Total[];
}
/**
 * In-store or curbside pickup fulfillment option with pickup location details
 */
export interface FulfillmentOptionPickup {
  /**
   * Fulfillment type discriminator
   */
  type: "pickup";
  /**
   * Unique identifier for this fulfillment option
   */
  id: string;
  /**
   * Display title for this pickup option
   */
  title: string;
  /**
   * Additional details about this pickup option
   */
  description?: string;
  /**
   * Pickup location details
   */
  location: {
    /**
     * Location name
     */
    name: string;
    address: Address1;
    /**
     * Location phone number
     */
    phone?: string;
    /**
     * Special pickup instructions
     */
    instructions?: string;
    [k: string]: unknown | undefined;
  };
  /**
   * Type of pickup method
   */
  pickup_type?: "in_store" | "curbside" | "locker";
  /**
   * RFC 3339 timestamp when order will be ready for pickup
   */
  ready_by?: string;
  /**
   * RFC 3339 timestamp by which order must be picked up
   */
  pickup_by?: string;
  /**
   * Cost breakdown for this fulfillment option
   */
  totals: Total[];
}
/**
 * Pickup address
 */
export interface Address1 {
  /**
   * Recipient name for this address
   */
  name: string;
  /**
   * Primary street address line
   */
  line_one: string;
  /**
   * Secondary address line (apartment, suite, etc.)
   */
  line_two?: string;
  /**
   * City name
   */
  city: string;
  /**
   * State or province code
   */
  state: string;
  /**
   * ISO 3166-1 alpha-2 country code
   */
  country: string;
  /**
   * Postal or ZIP code
   */
  postal_code: string;
  /**
   * Postal or ZIP code
   */
  company?: string;
}
/**
 * Local delivery fulfillment option with delivery address and scheduling details
 */
export interface FulfillmentOptionLocalDelivery {
  /**
   * Fulfillment type discriminator
   */
  type: "local_delivery";
  /**
   * Unique identifier for this fulfillment option
   */
  id: string;
  /**
   * Display title for this local delivery option
   */
  title: string;
  /**
   * Additional details about this delivery option
   */
  description?: string;
  /**
   * Expected delivery time window
   */
  delivery_window?: {
    /**
     * RFC 3339 timestamp for delivery window start
     */
    start: string;
    /**
     * RFC 3339 timestamp for delivery window end
     */
    end: string;
    [k: string]: unknown | undefined;
  };
  /**
   * Geographic service area for local delivery
   */
  service_area?: {
    /**
     * Delivery radius in miles
     */
    radius_miles?: number;
    /**
     * Center point postal code for delivery radius
     */
    center_postal_code?: string;
    [k: string]: unknown | undefined;
  };
  /**
   * Cost breakdown for this fulfillment option
   */
  totals: Total[];
}
/**
 * Fulfillment option selected by the buyer for specific line items
 */
export interface SelectedFulfillmentOption {
  /**
   * Type of fulfillment option selected
   */
  type: "shipping" | "digital" | "pickup" | "local_delivery";
  /**
   * ID of the selected fulfillment option
   */
  option_id: string;
  /**
   * List of line item IDs associated with this fulfillment option
   *
   * Items: Line item identifier
   */
  item_ids: string[];
}
/**
 * Group of line items that share the same fulfillment method and destination
 */
export interface FulfillmentGroup {
  /**
   * Unique identifier for this fulfillment group
   */
  id: string;
  /**
   * List of line item IDs in this fulfillment group
   *
   * Items: Line item identifier in this fulfillment group
   */
  item_ids: string[];
  /**
   * Type of fulfillment for this group
   */
  destination_type: "shipping" | "pickup" | "local_delivery" | "digital";
  fulfillment_details?: FulfillmentDetails1;
  /**
   * Location identifier for pickup or local delivery
   */
  location_id?: string;
  /**
   * Special fulfillment instructions
   */
  instructions?: string;
}
/**
 * Fulfillment contact and address details
 */
export interface FulfillmentDetails1 {
  /**
   * Full name for fulfillment contact
   */
  name?: string;
  /**
   * Contact phone number. E.164 format recommended (e.g., +15551234567) for global interoperability and SMS/delivery carrier systems.
   */
  phone_number?: string;
  /**
   * Contact email address
   */
  email?: string;
  address?: Address;
}
/**
 * Informational message to display to the buyer during checkout
 */
export interface MessageInfo {
  /**
   * Message type discriminator
   */
  type: "info";
  /**
   * Severity level of this informational message
   */
  severity?: "info" | "low" | "medium" | "high" | "critical";
  /**
   * Who resolves this message. 'recoverable': agent can fix via API. 'requires_buyer_input': buyer must provide info. 'requires_buyer_review': buyer must authorize.
   */
  resolution?: "recoverable" | "requires_buyer_input" | "requires_buyer_review";
  /**
   * RFC 9535 JSONPath
   */
  param?: string;
  /**
   * Format of the message content. When set to 'markdown', content MUST conform to CommonMark (https://spec.commonmark.org/0.31.2/). Raw HTML elements MUST NOT be included. When set to 'plain', content is plain text with no formatting.
   */
  content_type: "plain" | "markdown";
  /**
   * Informational message text. When content_type is 'markdown', this MUST be valid CommonMark with no raw HTML. Agents MUST render using a CommonMark-compliant parser with raw HTML output disabled or sanitized.
   */
  content: string;
}
/**
 * Warning message to display to the buyer during checkout (non-blocking)
 */
export interface MessageWarning {
  /**
   * Message type discriminator
   */
  type: "warning";
  /**
   * Warning code indicating the type of warning
   */
  code:
    | "low_stock"
    | "high_demand"
    | "shipping_delay"
    | "price_change"
    | "expiring_promotion"
    | "limited_availability"
    | "discount_code_expired"
    | "discount_code_invalid"
    | "discount_code_already_applied"
    | "discount_code_combination_disallowed"
    | "discount_code_minimum_not_met"
    | "discount_code_user_not_logged_in"
    | "discount_code_user_ineligible"
    | "discount_code_usage_limit_reached";
  /**
   * Severity level of this warning
   */
  severity?: "info" | "low" | "medium" | "high" | "critical";
  /**
   * Who resolves this message. 'recoverable': agent can fix via API. 'requires_buyer_input': buyer must provide info. 'requires_buyer_review': buyer must authorize.
   */
  resolution?: "recoverable" | "requires_buyer_input" | "requires_buyer_review";
  /**
   * RFC 9535 JSONPath
   */
  param?: string;
  /**
   * Format of the warning message content. When set to 'markdown', content MUST conform to CommonMark (https://spec.commonmark.org/0.31.2/). Raw HTML elements MUST NOT be included. When set to 'plain', content is plain text with no formatting.
   */
  content_type: "plain" | "markdown";
  /**
   * Warning message text. When content_type is 'markdown', this MUST be valid CommonMark with no raw HTML. Agents MUST render using a CommonMark-compliant parser with raw HTML output disabled or sanitized.
   */
  content: string;
}
/**
 * Business-logic error within a valid CheckoutSession response. Used in messages[] on 2xx responses when the session is valid but has actionable issues (e.g. status "not_ready_for_payment"). The agent can respond by asking the buyer for corrections or trying alternatives. Use MessageError—not Error—when you can return a valid CheckoutSession and the problem is conversational (e.g. invalid email → code "invalid" and param "$.buyer.email"; out of stock → code "out_of_stock" and param "$.items[0]").
 */
export interface MessageError {
  /**
   * Message type discriminator
   */
  type: "error";
  /**
   * Error code indicating the type of error
   */
  code:
    | "missing"
    | "invalid"
    | "out_of_stock"
    | "payment_declined"
    | "requires_sign_in"
    | "requires_3ds"
    | "low_stock"
    | "quantity_exceeded"
    | "coupon_invalid"
    | "coupon_expired"
    | "minimum_not_met"
    | "maximum_exceeded"
    | "region_restricted"
    | "age_verification_required"
    | "approval_required"
    | "unsupported"
    | "not_found"
    | "conflict"
    | "rate_limited"
    | "expired"
    | "intervention_required";
  /**
   * Severity level of this error
   */
  severity?: "info" | "low" | "medium" | "high" | "critical";
  /**
   * Who resolves this message. 'recoverable': agent can fix via API. 'requires_buyer_input': buyer must provide info. 'requires_buyer_review': buyer must authorize.
   */
  resolution?: "recoverable" | "requires_buyer_input" | "requires_buyer_review";
  /**
   * RFC 9535 JSONPath
   */
  param?: string;
  /**
   * Format of the error message content. When set to 'markdown', content MUST conform to CommonMark (https://spec.commonmark.org/0.31.2/). Raw HTML elements MUST NOT be included. When set to 'plain', content is plain text with no formatting.
   */
  content_type: "plain" | "markdown";
  /**
   * Error message text. When content_type is 'markdown', this MUST be valid CommonMark with no raw HTML. Agents MUST render using a CommonMark-compliant parser with raw HTML output disabled or sanitized.
   */
  content: string;
}
/**
 * Hyperlink with URL, display text, and optional action semantics
 */
export interface Link {
  /**
   * Type of link
   */
  type:
    | "terms_of_use"
    | "privacy_policy"
    | "return_policy"
    | "shipping_policy"
    | "contact_us"
    | "about_us"
    | "faq"
    | "support";
  /**
   * Display text for the link
   */
  title?: string;
  /**
   * URL destination
   */
  url: string;
}
/**
 * Authentication metadata for payment interventions (e.g., 3DS)
 */
export interface AuthenticationMetadata {
  /**
   * Details about the acquirer used for this 3DS Authentication. This object MUST be present.
   */
  acquirer_details: {
    /**
     * The Acquirer BIN (directory-server specific).
     */
    acquirer_bin: string;
    /**
     * Two-letter ISO 3166-1 alpha-2 country code.
     */
    acquirer_country: string;
    /**
     * The Merchant ID assigned by the acquirer.
     */
    acquirer_merchant_id: string;
    /**
     * Merchant name assigned by the acquirer.
     */
    merchant_name: string;
    /**
     * Requestor ID (if required by the directory server).
     */
    requestor_id?: string;
  };
  /**
   * The 3DS directory server used for this Authentication.
   */
  directory_server: "american_express" | "mastercard" | "visa";
  /**
   * Contains additional details on the seller's preference for the 3DS authentication flow. Sellers MAY request a preference, but issuers ultimately decide the actual flow.
   */
  flow_preference?: {
    /**
     * Type of flow requested for this 3DS Authentication. 'challenge' requests a challenge flow; 'frictionless' requests a frictionless flow.
     */
    type: "challenge" | "frictionless";
    /**
     * Details about the requested challenge flow.
     */
    challenge?: {
      /**
       * Subtype of challenge preference.
       */
      type?: "mandated" | "preferred";
    };
    /**
     * Details about the requested frictionless flow.
     */
    frictionless?: {
      /**
       * Subtype of frictionless preference.
       */
      type?: "low_risk";
    };
  };
  [k: string]: unknown | undefined;
}
/**
 * Discount extension: submitted codes and applied discounts. Present when the 'discount' extension is active.
 */
export interface DiscountsResponse1 {
  /**
   * Echo of submitted discount codes.
   *
   * Items: Discount code submitted
   */
  codes?: string[];
  /**
   * Discounts successfully applied (code-based and automatic).
   */
  applied?: AppliedDiscount1[];
  /**
   * Discount codes that could not be applied, with reasons.
   */
  rejected?: RejectedDiscount1[];
}
/**
 * A discount that was successfully applied to the checkout session.
 */
export interface AppliedDiscount1 {
  /**
   * Unique identifier for this applied discount instance.
   */
  id: string;
  /**
   * The discount code entered by the user. Omitted for automatic discounts.
   */
  code?: string;
  coupon: Coupon2;
  /**
   * Total discount amount in minor (cents) currency units.
   */
  amount: number;
  /**
   * True if applied automatically by merchant rules (no code required).
   */
  automatic?: boolean;
  /**
   * RFC 3339 timestamp when the discount became active.
   */
  start?: string;
  /**
   * RFC 3339 timestamp when the discount expires.
   */
  end?: string;
  /**
   * Allocation method. 'each' = applied independently per item. 'across' = split proportionally by value.
   */
  method?: "each" | "across";
  /**
   * Stacking order for discount calculation. Lower numbers applied first (1 = first).
   */
  priority?: number;
  /**
   * Breakdown of where this discount was allocated. Sum of allocation amounts equals total amount.
   */
  allocations?: DiscountAllocation[];
}
/**
 * Details about the underlying coupon/promotion.
 */
export interface Coupon2 {
  /**
   * Unique identifier for the coupon.
   */
  id: string;
  /**
   * Human-readable coupon name (e.g., 'Summer Sale 20% Off').
   */
  name: string;
  /**
   * Percentage discount (0-100). Mutually exclusive with amount_off.
   */
  percent_off?: number;
  /**
   * Fixed discount amount in minor currency units. Mutually exclusive with percent_off.
   */
  amount_off?: number;
  /**
   * ISO 4217 currency code for amount_off. Required if amount_off is set.
   */
  currency?: string;
  /**
   * How long the discount applies. 'once' = single use, 'repeating' = multiple billing periods, 'forever' = indefinitely.
   */
  duration?: "once" | "repeating" | "forever";
  /**
   * Number of months the coupon applies if duration is 'repeating'.
   */
  duration_in_months?: number;
  /**
   * Maximum number of times this coupon can be redeemed across all customers.
   */
  max_redemptions?: number;
  /**
   * Number of times this coupon has been redeemed.
   */
  times_redeemed?: number;
  /**
   * Arbitrary key-value metadata attached to the coupon.
   */
  metadata?: {
    /**
     * Metadata value
     */
    [k: string]: string | undefined;
  };
}
/**
 * Breakdown of how a discount amount was allocated to a specific target.
 */
export interface DiscountAllocation {
  /**
   * JSONPath to the allocation target (e.g., '$.line_items[0]', '$.totals.shipping').
   */
  path: string;
  /**
   * Amount allocated to this target in minor (cents) currency units.
   */
  amount: number;
}
/**
 * A discount code that could not be applied, with the reason.
 */
export interface RejectedDiscount1 {
  /**
   * The discount code that was rejected.
   */
  code: string;
  /**
   * Error code indicating why the discount was rejected.
   */
  reason:
    | "discount_code_expired"
    | "discount_code_invalid"
    | "discount_code_already_applied"
    | "discount_code_combination_disallowed"
    | "discount_code_minimum_not_met"
    | "discount_code_user_not_logged_in"
    | "discount_code_user_ineligible"
    | "discount_code_usage_limit_reached";
  /**
   * Human-readable explanation of why the code was rejected.
   */
  message?: string;
}
/**
 * Seller-declared marketing consent option that specifies an available channel for which the seller must obtain the buyer's consent before sending marketing content
 */
export interface MarketingConsentOption {
  /**
   * Channel for marketing consent.
   */
  channel: string;
  /**
   * What the buyer is consenting to receive, e.g., 'promotional emails, product launches, and exclusive offers'. Agents MAY use this to compose their own consent prompt.
   */
  display_text: string;
  /**
   * URL to the seller's privacy policy governing use of the buyer's contact information for marketing.
   */
  privacy_policy_url: string;
  /**
   * Whether the buyer is currently subscribed to marketing via this channel. When true, agents SHOULD render the consent checkbox as pre-checked. Defaults to false if omitted.
   */
  is_subscribed?: boolean;
}
/**
 * Order returned after checkout completion. Contains order details and optional rich post-purchase tracking.
 */
export interface Order {
  /**
   * Discriminator field for webhook payloads. Always 'order' when present.
   */
  type?: "order";
  /**
   * Unique identifier for the order
   */
  id: string;
  /**
   * ID of the checkout session that created this order
   */
  checkout_session_id: string;
  /**
   * Human-readable order number for customer reference
   */
  order_number?: string;
  /**
   * Reference from the client (agent/platform) stored on the order for reconciliation (e.g. platform transaction id, PO number, ERP id).
   */
  client_reference_id?: string;
  /**
   * Permanent URL where the customer can view order details
   */
  permalink_url: string;
  /**
   * Order-level status. Implementations MUST accept unrecognized values gracefully. Defined values: 'created', 'confirmed', 'manual_review', 'processing', 'shipped', 'completed', 'canceled'. 'completed' means all items have been delivered/received regardless of fulfillment method. Distinct from LineItem.status 'fulfilled', which indicates the seller has dispatched the item.
   */
  status?: string;
  estimated_delivery?: EstimatedDelivery;
  confirmation?: OrderConfirmation;
  support?: SupportInfo;
  /**
   * What was ordered, with per-item fulfillment tracking
   */
  line_items?: OrderLineItem[];
  /**
   * How items are being delivered (shipping, pickup, digital)
   */
  fulfillments?: Fulfillment[];
  /**
   * Post-order changes: refunds, credits, returns, disputes
   */
  adjustments?: Adjustment[];
  /**
   * Order-level totals using the same Total schema as checkout. The 'total' entry is always the original charged amount. 'amount_refunded' tracks cumulative refunds.
   */
  totals?: Total[];
}
/**
 * Estimated delivery time range
 */
export interface EstimatedDelivery {
  /**
   * RFC 3339 timestamp for earliest expected delivery
   */
  earliest: string;
  /**
   * RFC 3339 timestamp for latest expected delivery
   */
  latest: string;
}
/**
 * Order confirmation details
 */
export interface OrderConfirmation {
  /**
   * Order confirmation number
   */
  confirmation_number?: string;
  /**
   * Whether a confirmation email has been sent
   */
  confirmation_email_sent?: boolean;
  /**
   * URL to the order receipt
   */
  receipt_url?: string;
  /**
   * Invoice number if generated
   */
  invoice_number?: string;
  /**
   * Echo of order_notes attached to the order.
   */
  order_notes?: string;
}
/**
 * Customer support contact information
 */
export interface SupportInfo {
  /**
   * Support contact email
   */
  email?: string;
  /**
   * Support contact phone number
   */
  phone?: string;
  /**
   * Support hours of operation
   */
  hours?: string;
  /**
   * URL to merchant's help center
   */
  help_center_url?: string;
}
/**
 * Per-line-item tracking of what was ordered and fulfillment progress.
 */
export interface OrderLineItem {
  /**
   * Line item identifier, used for references in fulfillments and adjustments
   */
  id: string;
  /**
   * Product name
   */
  title: string;
  /**
   * Catalog product ID
   */
  product_id?: string;
  /**
   * Product description
   */
  description?: string;
  /**
   * Product image URL
   */
  image_url?: string;
  /**
   * Product page URL
   */
  url?: string;
  quantity: OrderLineItemQuantity;
  /**
   * Price per unit in minor currency units (cents)
   */
  unit_price?: number;
  /**
   * Line total in minor currency units
   */
  subtotal?: number;
  /**
   * Optional line-item level totals breakdown using the same Total schema as checkout. Merchants who can provide richer breakdowns MAY use this alongside or instead of unit_price/subtotal.
   */
  totals?: Total[];
  /**
   * Derived from quantity fields. Implementations MUST accept unrecognized values gracefully. Defined values: 'processing', 'partial', 'fulfilled', 'removed'. Rules: 'removed' if current==0, 'fulfilled' if fulfilled==current, 'partial' if 0<fulfilled<current, 'processing' otherwise.
   */
  status?: string;
}
/**
 * Quantity tracking for an order line item. Uses a 3-field model: ordered (original), current (active after cancellations/returns), fulfilled (completed).
 */
export interface OrderLineItemQuantity {
  /**
   * Quantity originally ordered by the customer
   */
  ordered: number;
  /**
   * Current active quantity on the order. May be less than ordered due to cancellations or returns. A value of 0 means the line item has been fully removed.
   */
  current: number;
  /**
   * Quantity that has been fulfilled (shipped, picked up, or digitally delivered). Applies to all fulfillment types, not just shipping.
   */
  fulfilled?: number;
}
/**
 * A fulfillment represents how items are delivered to the buyer (shipping, pickup, digital).
 */
export interface Fulfillment {
  /**
   * Fulfillment identifier
   */
  id: string;
  /**
   * Fulfillment method type
   */
  type: "shipping" | "pickup" | "digital";
  /**
   * Current fulfillment status. Implementations MUST accept unrecognized values gracefully. Defined values: 'pending', 'processing', 'shipped', 'in_transit', 'out_for_delivery', 'ready_for_pickup', 'delivered', 'failed', 'canceled'. Not all statuses apply to all types.
   */
  status?: string;
  /**
   * Which line items and quantities are in this fulfillment
   */
  line_items?: LineItemReference[];
  /**
   * Carrier name (e.g., 'FedEx', 'UPS', 'USPS'). Applies to type: shipping.
   */
  carrier?: string;
  /**
   * Carrier tracking number. Applies to type: shipping.
   */
  tracking_number?: string;
  /**
   * URL to track this shipment. Applies to type: shipping.
   */
  tracking_url?: string;
  destination?: Address2;
  estimated_delivery?: EstimatedDelivery1;
  /**
   * Digital delivery details. Applies to type: digital.
   */
  digital_delivery?: {
    /**
     * URL to access digital content (download link, streaming page, etc.)
     */
    access_url?: string;
    /**
     * License or activation key
     */
    license_key?: string;
    /**
     * When access expires (RFC 3339 timestamp)
     */
    expires_at?: string;
    [k: string]: unknown | undefined;
  };
  /**
   * Human-readable description (e.g., 'Backordered - ships Feb 15')
   */
  description?: string;
  /**
   * Append-only event log tracking fulfillment progress
   */
  events?: FulfillmentEvent[];
}
/**
 * Reference to a line item with quantity, used in fulfillments and adjustments
 */
export interface LineItemReference {
  /**
   * Line item ID reference
   */
  id: string;
  /**
   * Quantity in this fulfillment or adjustment
   */
  quantity: number;
}
/**
 * Physical address for shipping, billing, or pickup locations
 */
export interface Address2 {
  /**
   * Recipient name for this address
   */
  name: string;
  /**
   * Primary street address line
   */
  line_one: string;
  /**
   * Secondary address line (apartment, suite, etc.)
   */
  line_two?: string;
  /**
   * City name
   */
  city: string;
  /**
   * State or province code
   */
  state: string;
  /**
   * ISO 3166-1 alpha-2 country code
   */
  country: string;
  /**
   * Postal or ZIP code
   */
  postal_code: string;
  /**
   * Postal or ZIP code
   */
  company?: string;
}
/**
 * Estimated delivery date range for a fulfillment option
 */
export interface EstimatedDelivery1 {
  /**
   * RFC 3339 timestamp for earliest expected delivery
   */
  earliest: string;
  /**
   * RFC 3339 timestamp for latest expected delivery
   */
  latest: string;
}
/**
 * A point-in-time event in the fulfillment lifecycle.
 */
export interface FulfillmentEvent {
  /**
   * Event identifier
   */
  id: string;
  /**
   * Event type. Implementations MUST accept unrecognized values gracefully. Defined values: 'processing', 'shipped', 'in_transit', 'out_for_delivery', 'ready_for_pickup', 'delivered', 'failed_attempt', 'returned_to_sender', 'canceled', 'undeliverable'. 'out_for_delivery' and 'ready_for_pickup' are ACP extensions for richer agent experiences.
   */
  type: string;
  /**
   * RFC 3339 timestamp when this event occurred
   */
  occurred_at: string;
  /**
   * Human-readable description (e.g., 'Left at front door')
   */
  description?: string;
  /**
   * Location where this event occurred (e.g., 'Memphis, TN')
   */
  location?: string;
}
/**
 * A post-order change such as refund, credit, return, or dispute.
 */
export interface Adjustment {
  /**
   * Adjustment identifier
   */
  id: string;
  /**
   * Type of adjustment. Implementations MUST accept unrecognized values gracefully. Defined values: 'refund', 'credit', 'return', 'exchange', 'price_adjustment', 'cancellation', 'dispute'. Use 'refund' for both full and partial refunds (distinguish by amount). 'credit' replaces 'store_credit'. 'dispute' covers chargebacks.
   */
  type: string;
  /**
   * RFC 3339 timestamp when this adjustment occurred
   */
  occurred_at: string;
  /**
   * Adjustment status. Implementations MUST accept unrecognized values gracefully. Defined values: 'pending', 'completed', 'failed'.
   */
  status: string;
  /**
   * Which line items and quantities are affected
   */
  line_items?: LineItemReference[];
  /**
   * Total amount credited to the buyer in minor currency units, inclusive of any applicable tax
   */
  amount?: number;
  /**
   * ISO 4217 currency code
   */
  currency?: string;
  /**
   * Human-readable reason (e.g., 'Defective item')
   */
  description?: string;
  /**
   * Structured reason code
   */
  reason?: string;
}
/**
 * Discount codes and applied discounts for this checkout session.
 */
export interface DiscountsResponse2 {
  /**
   * Echo of submitted discount codes.
   *
   * Items: Discount code submitted
   */
  codes?: string[];
  /**
   * Discounts successfully applied (code-based and automatic).
   */
  applied?: AppliedDiscount[];
  /**
   * Discount codes that could not be applied, with reasons.
   */
  rejected?: RejectedDiscount[];
}
/**
 * Request to create a new checkout session
 */
export interface CheckoutSessionCreateRequest {
  buyer?: Buyer1;
  /**
   * Items to add to the checkout session
   *
   * @minItems 1
   */
  line_items: [Item1, ...Item1[]];
  /**
   * ISO 4217 currency code
   */
  currency: string;
  fulfillment_details?: FulfillmentDetails2;
  capabilities: Capabilities1;
  /**
   * Grouping of items by fulfillment method
   */
  fulfillment_groups?: FulfillmentGroup[];
  affiliate_attribution?: AffiliateAttribution;
  /**
   * DEPRECATED: Use discounts.codes instead. Discount codes to apply.
   *
   * Items: Coupon code to apply
   */
  coupons?: string[];
  discounts?: DiscountsRequest1;
  /**
   * Locale code for localizing content (e.g., 'en-US')
   */
  locale?: string;
  /**
   * IANA timezone identifier (e.g., 'America/New_York')
   */
  timezone?: string;
  /**
   * Quote identifier if this session is based on a quote
   */
  quote_id?: string;
  /**
   * Arbitrary metadata for merchant use
   */
  metadata?: {
    [k: string]: unknown | undefined;
  };
  /**
   * Optional customer/order notes (e.g., delivery instructions, gift message).
   */
  order_notes?: string;
}
/**
 * Buyer information
 */
export interface Buyer1 {
  /**
   * Buyer's first name
   */
  first_name?: string;
  /**
   * Buyer's last name
   */
  last_name?: string;
  /**
   * Buyer's full name
   */
  full_name?: string;
  /**
   * Buyer's email address
   */
  email: string;
  /**
   * Buyer's phone number
   */
  phone_number?: string;
  /**
   * Merchant's internal customer identifier
   */
  customer_id?: string;
  /**
   * Type of buyer account
   */
  account_type?: "guest" | "registered" | "business";
  /**
   * Buyer's authentication status
   */
  authentication_status?: "authenticated" | "guest" | "requires_signin";
  company?: CompanyInfo;
  loyalty?: LoyaltyInfo;
  tax_exemption?: TaxExemption;
}
/**
 * A purchasable item with variant options (e.g., size, color) and quantity
 */
export interface Item1 {
  /**
   * Unique identifier for the item
   */
  id: string;
  /**
   * Display name of the item
   */
  name?: string;
  /**
   * Price per unit in minor currency units (e.g. 100 cents for $1.00 or 100 for ¥100)
   */
  unit_amount?: number;
}
/**
 * Fulfillment contact and address details
 */
export interface FulfillmentDetails2 {
  /**
   * Full name for fulfillment contact
   */
  name?: string;
  /**
   * Contact phone number. E.164 format recommended (e.g., +15551234567) for global interoperability and SMS/delivery carrier systems.
   */
  phone_number?: string;
  /**
   * Contact email address
   */
  email?: string;
  address?: Address;
}
/**
 * Agent capabilities and supported features
 */
export interface Capabilities1 {
  payment?: Payment;
  interventions?: InterventionCapabilities;
  /**
   * Extensions supported by the party. Requests: array of extension identifiers. Responses: array of extension declaration objects.
   */
  extensions?: string[] | ExtensionDeclaration[];
}
/**
 * Context about where the attribution originated.
 */
export interface AffiliateAttributionSource {
  /**
   * The type of attribution source.
   */
  type: "url" | "platform" | "unknown";
  /**
   * Canonical content URL when type is 'url'.
   */
  url?: string;
}
/**
 * Flat key/value map for additional non-sensitive context. Keys must be strings; values must be strings, numbers, or booleans. Arrays and nested objects are NOT permitted.
 */
export interface AffiliateAttributionMetadata {
  [k: string]: string | number | boolean | undefined;
}
/**
 * Discount codes to apply to the checkout session.
 */
export interface DiscountsRequest1 {
  /**
   * Discount codes to apply. Case-insensitive. Replaces previously submitted codes. Send empty array to clear.
   *
   * Items: Discount code to apply
   */
  codes?: string[];
}
/**
 * Discount codes to apply to the new checkout session.
 */
export interface DiscountsRequest2 {
  /**
   * Discount codes to apply. Case-insensitive. Replaces previously submitted codes. Send empty array to clear.
   *
   * Items: Discount code to apply
   */
  codes?: string[];
}
/**
 * Request to update an existing checkout session
 */
export interface CheckoutSessionUpdateRequest {
  buyer?: Buyer2;
  /**
   * Items to update in the checkout session
   */
  line_items?: Item1[];
  fulfillment_details?: FulfillmentDetails3;
  /**
   * Updated fulfillment groupings
   */
  fulfillment_groups?: FulfillmentGroup[];
  /**
   * Fulfillment option selected by the buyer
   */
  selected_fulfillment_options?: SelectedFulfillmentOption[];
  /**
   * DEPRECATED: Use discounts.codes instead. Discount codes to apply.
   *
   * Items: Coupon code to apply
   */
  coupons?: string[];
  discounts?: DiscountsRequest3;
  /**
   * Optional customer/order notes.
   */
  order_notes?: string;
}
/**
 * Updated buyer information
 */
export interface Buyer2 {
  /**
   * Buyer's first name
   */
  first_name?: string;
  /**
   * Buyer's last name
   */
  last_name?: string;
  /**
   * Buyer's full name
   */
  full_name?: string;
  /**
   * Buyer's email address
   */
  email: string;
  /**
   * Buyer's phone number
   */
  phone_number?: string;
  /**
   * Merchant's internal customer identifier
   */
  customer_id?: string;
  /**
   * Type of buyer account
   */
  account_type?: "guest" | "registered" | "business";
  /**
   * Buyer's authentication status
   */
  authentication_status?: "authenticated" | "guest" | "requires_signin";
  company?: CompanyInfo;
  loyalty?: LoyaltyInfo;
  tax_exemption?: TaxExemption;
}
/**
 * Updated fulfillment contact and address
 */
export interface FulfillmentDetails3 {
  /**
   * Full name for fulfillment contact
   */
  name?: string;
  /**
   * Contact phone number. E.164 format recommended (e.g., +15551234567) for global interoperability and SMS/delivery carrier systems.
   */
  phone_number?: string;
  /**
   * Contact email address
   */
  email?: string;
  address?: Address;
}
/**
 * Discount codes to apply. Replaces previously submitted codes.
 */
export interface DiscountsRequest3 {
  /**
   * Discount codes to apply. Case-insensitive. Replaces previously submitted codes. Send empty array to clear.
   *
   * Items: Discount code to apply
   */
  codes?: string[];
}
/**
 * Discount codes to apply. Replaces previously submitted codes.
 */
export interface DiscountsRequest4 {
  /**
   * Discount codes to apply. Case-insensitive. Replaces previously submitted codes. Send empty array to clear.
   *
   * Items: Discount code to apply
   */
  codes?: string[];
}
