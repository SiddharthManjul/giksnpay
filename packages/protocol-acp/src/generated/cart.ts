/**
 * Generated from the vendored official ACP 2026-04-17 JSON Schema.
 * Source: protocol/acp/2026-04-17/spec/json-schema/schema.cart.json
 * Source SHA-256: 4480260393132f24da09fb99554dd510822f22345755394c72c2444e24ddd0b3
 * Do not edit by hand. Run `pnpm --filter @mindpay/protocol-acp generate`.
 */

export interface CartSchemaBundle {
  [k: string]: unknown | undefined;
}
/**
 * A shopping cart with estimated pricing. Carts provide a lightweight pre-checkout phase for item collection without payment configuration or status lifecycle.
 *
 * This interface was referenced by `CartSchemaBundle`'s JSON-Schema
 * via the `definition` "Cart".
 */
export interface Cart {
  /**
   * Unique cart identifier, server-generated.
   */
  id: string;
  /**
   * Cart line items. Same structure as checkout line items.
   */
  line_items: LineItem[];
  buyer?: Buyer;
  /**
   * ISO 4217 currency code. Determined by the seller based on context or request.
   */
  currency: string;
  /**
   * Estimated cost breakdown. May be partial (e.g., tax omitted if address is unknown). Totals are estimates until checkout.
   */
  totals: Total[];
  /**
   * Validation messages, warnings, or informational notices (e.g., low stock, price changes).
   */
  messages?: (MessageInfo | MessageWarning | MessageError)[];
  /**
   * URL for cart handoff, sharing, or session recovery.
   */
  continue_url?: string;
  /**
   * RFC 3339 timestamp when the cart expires.
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
 * Buyer information, if provided.
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
 * Request to create a new cart.
 *
 * This interface was referenced by `CartSchemaBundle`'s JSON-Schema
 * via the `definition` "CartCreateRequest".
 */
export interface CartCreateRequest {
  /**
   * Items to add to the cart.
   *
   * @minItems 1
   */
  line_items: [Item1, ...Item1[]];
  buyer?: Buyer1;
  /**
   * Locale code for content localization (e.g., 'en-US').
   */
  locale?: string;
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
 * Buyer information for personalized estimates.
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
 * Request to update a cart. Full replacement — the agent MUST send the complete desired cart state.
 *
 * This interface was referenced by `CartSchemaBundle`'s JSON-Schema
 * via the `definition` "CartUpdateRequest".
 */
export interface CartUpdateRequest {
  /**
   * Complete list of items (replaces existing cart contents).
   *
   * @minItems 1
   */
  line_items: [Item1, ...Item1[]];
  buyer?: Buyer2;
}
/**
 * Updated buyer information.
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
