/**
 * Generated from the vendored official ACP 2026-04-17 JSON Schema.
 * Source: protocol/acp/2026-04-17/spec/json-schema/schema.delegate_payment.json
 * Source SHA-256: 307739ae400e7368eaa25c6024d30751348a4af8a516d071565fcd8aa328cf4d
 * Do not edit by hand. Run `pnpm --filter @mindpay/protocol-acp generate`.
 */

export interface DelegatePaymentSchemaBundle {
  [k: string]: unknown | undefined;
}
/**
 * Physical address for billing or shipping purposes
 *
 * This interface was referenced by `DelegatePaymentSchemaBundle`'s JSON-Schema
 * via the `definition` "Address".
 */
export interface Address {
  /**
   * Full name of the person at this address
   */
  name: string;
  /**
   * Street address line 1 (e.g., street and number)
   */
  line_one: string;
  /**
   * Street address line 2 (e.g., apartment, suite, unit)
   */
  line_two?: string;
  /**
   * City or locality
   */
  city: string;
  /**
   * State, province, or region
   */
  state: string;
  /**
   * ISO-3166-1 alpha-2 country code
   */
  country: string;
  /**
   * ZIP or postal code
   */
  postal_code: string;
}
/**
 * Card payment method details including card number, expiration, and verification data
 *
 * This interface was referenced by `DelegatePaymentSchemaBundle`'s JSON-Schema
 * via the `definition` "PaymentMethodCard".
 */
export interface PaymentMethodCard {
  /**
   * Payment method type, always 'card'
   */
  type: "card";
  /**
   * Whether the number is a raw card number (fpan) or a network token
   */
  card_number_type: "fpan" | "network_token";
  /**
   * network token or fallback fpan value
   */
  number: string;
  /**
   * Two-digit expiration month (01-12)
   */
  exp_month?: string;
  /**
   * Four-digit expiration year (e.g., 2026)
   */
  exp_year?: string;
  /**
   * Cardholder name as it appears on the card
   */
  name?: string;
  /**
   * Card verification code (3 or 4 digits)
   */
  cvc?: string;
  /**
   * Dynamic cryptogram for tokenized card transactions
   */
  cryptogram?: string;
  /**
   * Electronic Commerce Indicator for 3DS authentication status
   */
  eci_value?: string;
  /**
   * List of verification checks performed on the card
   */
  checks_performed?: ("avs" | "cvv" | "ani" | "auth0")[];
  /**
   * Issuer Identification Number (first 6 digits of card)
   */
  iin?: string;
  /**
   * Card funding type for display purposes
   */
  display_card_funding_type: "credit" | "debit" | "prepaid";
  /**
   * Digital wallet provider if card is from a wallet (e.g., Apple Pay, Google Pay)
   */
  display_wallet_type?: string;
  /**
   * Card brand for display purposes (e.g., visa, mastercard)
   */
  display_brand?: string;
  /**
   * Last 4 digits of card number for display purposes
   */
  display_last4?: string;
  /**
   * Additional metadata about the payment method
   */
  metadata: {
    /**
     * Metadata value
     */
    [k: string]: string | undefined;
  };
  /**
   * Whether this is a virtual card number
   */
  virtual?: boolean;
}
/**
 * Constraints on how the delegated payment method can be used (amount limit, expiration, merchant)
 *
 * This interface was referenced by `DelegatePaymentSchemaBundle`'s JSON-Schema
 * via the `definition` "Allowance".
 */
export interface Allowance {
  /**
   * Usage pattern for this allowance; currently only one_time is supported
   */
  reason: "one_time";
  /**
   * Maximum charge amount in minor units (e.g. 100 cents for $1.00 or 100 for ¥100)
   */
  max_amount: number;
  /**
   * ISO-4217 three-letter lowercase currency code (e.g., usd)
   */
  currency: string;
  /**
   * Identifier of the checkout session this payment is for
   */
  checkout_session_id: string;
  /**
   * Unique identifier for the merchant authorized to use this token
   */
  merchant_id: string;
  /**
   * ISO 8601 timestamp when this allowance expires
   */
  expires_at: string;
}
/**
 * Fraud detection signal indicating detected risk patterns and recommended actions
 *
 * This interface was referenced by `DelegatePaymentSchemaBundle`'s JSON-Schema
 * via the `definition` "RiskSignal".
 */
export interface RiskSignal {
  /**
   * Type of risk signal detected
   */
  type: "card_testing";
  /**
   * Risk score indicating severity level
   */
  score: number;
  /**
   * Recommended action based on risk assessment
   */
  action: "blocked" | "manual_review" | "authorized";
}
/**
 * Request to tokenize a payment method for delegated use by a merchant
 *
 * This interface was referenced by `DelegatePaymentSchemaBundle`'s JSON-Schema
 * via the `definition` "DelegatePaymentRequest".
 */
export interface DelegatePaymentRequest {
  payment_method: PaymentMethodCard1;
  allowance: Allowance1;
  billing_address?: Address1;
  /**
   * List of risk assessment signals from fraud detection
   */
  risk_signals: RiskSignal[];
  /**
   * Additional metadata for the request
   */
  metadata: {
    /**
     * Metadata value
     */
    [k: string]: string | undefined;
  };
}
/**
 * The card payment method to tokenize for delegated use
 */
export interface PaymentMethodCard1 {
  /**
   * Payment method type, always 'card'
   */
  type: "card";
  /**
   * Whether the number is a raw card number (fpan) or a network token
   */
  card_number_type: "fpan" | "network_token";
  /**
   * network token or fallback fpan value
   */
  number: string;
  /**
   * Two-digit expiration month (01-12)
   */
  exp_month?: string;
  /**
   * Four-digit expiration year (e.g., 2026)
   */
  exp_year?: string;
  /**
   * Cardholder name as it appears on the card
   */
  name?: string;
  /**
   * Card verification code (3 or 4 digits)
   */
  cvc?: string;
  /**
   * Dynamic cryptogram for tokenized card transactions
   */
  cryptogram?: string;
  /**
   * Electronic Commerce Indicator for 3DS authentication status
   */
  eci_value?: string;
  /**
   * List of verification checks performed on the card
   */
  checks_performed?: ("avs" | "cvv" | "ani" | "auth0")[];
  /**
   * Issuer Identification Number (first 6 digits of card)
   */
  iin?: string;
  /**
   * Card funding type for display purposes
   */
  display_card_funding_type: "credit" | "debit" | "prepaid";
  /**
   * Digital wallet provider if card is from a wallet (e.g., Apple Pay, Google Pay)
   */
  display_wallet_type?: string;
  /**
   * Card brand for display purposes (e.g., visa, mastercard)
   */
  display_brand?: string;
  /**
   * Last 4 digits of card number for display purposes
   */
  display_last4?: string;
  /**
   * Additional metadata about the payment method
   */
  metadata: {
    /**
     * Metadata value
     */
    [k: string]: string | undefined;
  };
  /**
   * Whether this is a virtual card number
   */
  virtual?: boolean;
}
/**
 * Constraints on how the payment method can be used
 */
export interface Allowance1 {
  /**
   * Usage pattern for this allowance; currently only one_time is supported
   */
  reason: "one_time";
  /**
   * Maximum charge amount in minor units (e.g. 100 cents for $1.00 or 100 for ¥100)
   */
  max_amount: number;
  /**
   * ISO-4217 three-letter lowercase currency code (e.g., usd)
   */
  currency: string;
  /**
   * Identifier of the checkout session this payment is for
   */
  checkout_session_id: string;
  /**
   * Unique identifier for the merchant authorized to use this token
   */
  merchant_id: string;
  /**
   * ISO 8601 timestamp when this allowance expires
   */
  expires_at: string;
}
/**
 * Billing address associated with the payment method
 */
export interface Address1 {
  /**
   * Full name of the person at this address
   */
  name: string;
  /**
   * Street address line 1 (e.g., street and number)
   */
  line_one: string;
  /**
   * Street address line 2 (e.g., apartment, suite, unit)
   */
  line_two?: string;
  /**
   * City or locality
   */
  city: string;
  /**
   * State, province, or region
   */
  state: string;
  /**
   * ISO-3166-1 alpha-2 country code
   */
  country: string;
  /**
   * ZIP or postal code
   */
  postal_code: string;
}
/**
 * Response containing the vault token identifier for the delegated payment method
 *
 * This interface was referenced by `DelegatePaymentSchemaBundle`'s JSON-Schema
 * via the `definition` "DelegatePaymentResponse".
 */
export interface DelegatePaymentResponse {
  /**
   * Unique vault token identifier (vt_...)
   */
  id: string;
  /**
   * ISO 8601 timestamp when the token was created
   */
  created: string;
  /**
   * Metadata echoed from the request plus system-added fields
   */
  metadata: {
    /**
     * Metadata value
     */
    [k: string]: string | undefined;
  };
}
/**
 * Error response for delegate payment API requests
 *
 * This interface was referenced by `DelegatePaymentSchemaBundle`'s JSON-Schema
 * via the `definition` "Error".
 */
export interface Error {
  /**
   * High-level error category
   */
  type: "invalid_request" | "rate_limit_exceeded" | "processing_error" | "service_unavailable";
  /**
   * Specific error code for programmatic handling
   */
  code:
    | "invalid_card"
    | "duplicate_request"
    | "idempotency_conflict"
    | "too_many_requests"
    | "idempotency_key_required"
    | "idempotency_in_flight";
  /**
   * Human-readable error message
   */
  message: string;
  /**
   * JSONPath of offending field
   */
  param?: string;
  /**
   * List of API versions supported by the server, ordered by preference (newest first). Only included in version-related errors.
   *
   * Items: API version in YYYY-MM-DD format
   */
  supported_versions?: string[];
}
