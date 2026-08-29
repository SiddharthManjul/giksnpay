/**
 * Generated from the vendored official ACP 2026-04-17 JSON Schema.
 * Source: protocol/acp/2026-04-17/spec/json-schema/schema.delegate_authentication.json
 * Source SHA-256: e550e881594748cb9f69a68e1c5710efa326ed6d4ee5ec8a19330ef86eaa5b52
 * Do not edit by hand. Run `pnpm --filter @mindpay/protocol-acp generate`.
 */

/**
 * Browser-specific metadata required for 3DS2 fingerprinting.
 *
 * This interface was referenced by `DelegateAuthenticationSchemaBundle`'s JSON-Schema
 * via the `definition` "BrowserInfo".
 */
export type BrowserInfo = {
  /**
   * HTTP Accept header from the browser
   */
  accept_header: string;
  /**
   * IP address of the browser
   */
  ip_address: string;
  /**
   * Whether JavaScript is enabled
   */
  javascript_enabled: boolean;
  /**
   * IETF BCP 47 language tag
   */
  language: string;
  /**
   * Browser user agent string
   */
  user_agent: string;
  /**
   * Screen color depth (required if javascript_enabled is true)
   */
  color_depth?: number;
  /**
   * Whether Java is enabled (required if javascript_enabled is true)
   */
  java_enabled?: boolean;
  /**
   * Screen height in pixels (required if javascript_enabled is true)
   */
  screen_height?: number;
  /**
   * Screen width in pixels (required if javascript_enabled is true)
   */
  screen_width?: number;
  /**
   * Timezone offset in minutes (required if javascript_enabled is true)
   */
  timezone_offset?: number;
};
/**
 * Describes browser action required
 *
 * This interface was referenced by `DelegateAuthenticationSchemaBundle`'s JSON-Schema
 * via the `definition` "Action".
 */
export type Action = {
  /**
   * The type of action required
   */
  type: "fingerprint" | "challenge";
  fingerprint?: FingerprintAction;
  challenge?: ChallengeAction;
} & Action1;
export type Action1 =
  | {
      type?: "fingerprint";
      [k: string]: unknown | undefined;
    }
  | {
      type?: "challenge";
      [k: string]: unknown | undefined;
    };
/**
 * Object representing the current state of the authentication session.
 *
 * This interface was referenced by `DelegateAuthenticationSchemaBundle`'s JSON-Schema
 * via the `definition` "DelegateAuthenticationSession".
 */
export type DelegateAuthenticationSession = DelegateAuthenticationSessionBase;
/**
 * The session details including the final 3DS authentication result.
 *
 * This interface was referenced by `DelegateAuthenticationSchemaBundle`'s JSON-Schema
 * via the `definition` "DelegateAuthenticationSessionWithResult".
 */
export type DelegateAuthenticationSessionWithResult = DelegateAuthenticationSessionBase & {
  authentication_result?: AuthenticationResult;
  [k: string]: unknown | undefined;
};

export interface DelegateAuthenticationSchemaBundle {
  [k: string]: unknown | undefined;
}
/**
 * The physical address details for the shopper.
 *
 * This interface was referenced by `DelegateAuthenticationSchemaBundle`'s JSON-Schema
 * via the `definition` "Address".
 */
export interface Address {
  /**
   * Full name of the recipient
   */
  name: string;
  /**
   * First line of the address
   */
  line_one: string;
  /**
   * Second line of the address
   */
  line_two?: string;
  /**
   * City name
   */
  city: string;
  /**
   * ISO-3166-2 where applicable
   */
  state: string;
  /**
   * ISO-3166-1 alpha-2
   */
  country: string;
  /**
   * Postal or ZIP code
   */
  postal_code: string;
}
/**
 * Payment instrument details used for authentication.
 *
 * This interface was referenced by `DelegateAuthenticationSchemaBundle`'s JSON-Schema
 * via the `definition` "PaymentMethod".
 */
export interface PaymentMethod {
  /**
   * The payment method type
   */
  type: "card";
  /**
   * Card number (PAN)
   */
  number: string;
  /**
   * Expiry month (01-12)
   */
  exp_month: string;
  /**
   * Expiry year (4 digits)
   */
  exp_year: string;
  /**
   * Cardholder name
   */
  name: string;
}
/**
 * The transaction amount and currency.
 *
 * This interface was referenced by `DelegateAuthenticationSchemaBundle`'s JSON-Schema
 * via the `definition` "Amount".
 */
export interface Amount {
  /**
   * Amount in minor units (e.g., 1000 = €10.00)
   */
  value: number;
  /**
   * ISO 4217 currency code
   */
  currency: string;
}
/**
 * The communication channel between the shopper and the merchant.
 *
 * This interface was referenced by `DelegateAuthenticationSchemaBundle`'s JSON-Schema
 * via the `definition` "Channel".
 */
export interface Channel {
  /**
   * Channel type
   */
  type: "browser";
  browser: BrowserInfo;
}
/**
 * Preference for the 3DS authentication flow. Clients MAY request a preference, but issuers ultimately decide the actual flow.
 *
 * This interface was referenced by `DelegateAuthenticationSchemaBundle`'s JSON-Schema
 * via the `definition` "FlowPreference".
 */
export interface FlowPreference {
  /**
   * Type of flow requested
   */
  type: "challenge" | "frictionless";
  /**
   * Specific preferences if a challenge is requested.
   */
  challenge?: {
    /**
     * Subtype of challenge preference
     */
    type?: "mandated" | "preferred";
  };
  /**
   * Details about the requested frictionless flow
   */
  frictionless?: {};
}
/**
 * Information about the shopper performing the transaction.
 *
 * This interface was referenced by `DelegateAuthenticationSchemaBundle`'s JSON-Schema
 * via the `definition` "ShopperDetails".
 */
export interface ShopperDetails {
  /**
   * Shopper name
   */
  name?: string;
  /**
   * Shopper email
   */
  email?: string;
  /**
   * Shopper phone number
   */
  phone_number?: string;
  address?: Address;
}
/**
 * Details for executing a 3DS fingerprinting action.
 *
 * This interface was referenced by `DelegateAuthenticationSchemaBundle`'s JSON-Schema
 * via the `definition` "FingerprintAction".
 */
export interface FingerprintAction {
  /**
   * URL to POST fingerprint data to via hidden iframe
   */
  three_ds_method_url: string;
  /**
   * 3DS Server transaction ID
   */
  three_ds_server_trans_id: string;
}
/**
 * Details for executing a 3DS challenge action.
 *
 * This interface was referenced by `DelegateAuthenticationSchemaBundle`'s JSON-Schema
 * via the `definition` "ChallengeAction".
 */
export interface ChallengeAction {
  /**
   * URL to POST challenge request to
   */
  acs_url: string;
  /**
   * ACS transaction identifier
   */
  acs_trans_id: string;
  /**
   * 3DS Server transaction identifier
   */
  three_ds_server_trans_id: string;
  /**
   * 3DS protocol version (e.g., "2.2.0")
   */
  message_version: string;
}
/**
 * 3DS authentication result returned by the authentication provider
 *
 * This interface was referenced by `DelegateAuthenticationSchemaBundle`'s JSON-Schema
 * via the `definition` "AuthenticationResult".
 */
export interface AuthenticationResult {
  /**
   * Transaction status (Y, N, A, U, R, etc.)
   */
  trans_status: string;
  /**
   * Electronic Commerce Indicator
   */
  electronic_commerce_indicator?: string;
  /**
   * Authentication cryptogram (CAVV/AAV)
   */
  three_ds_cryptogram?: string;
  /**
   * Directory Server transaction ID
   */
  transaction_id: string;
  /**
   * 3DS Server transaction ID
   */
  three_ds_server_trans_id: string;
  /**
   * 3DS protocol version
   */
  version: string;
  /**
   * Authentication value (CAVV)
   */
  authentication_value?: string;
  /**
   * Reason code for trans_status
   */
  trans_status_reason?: string;
  /**
   * Message to display to cardholder
   */
  cardholder_info?: string;
}
/**
 * Request body for creating an authentication session.
 *
 * This interface was referenced by `DelegateAuthenticationSchemaBundle`'s JSON-Schema
 * via the `definition` "DelegateAuthenticationCreateRequest".
 */
export interface DelegateAuthenticationCreateRequest {
  /**
   * Merchant identifier
   */
  merchant_id: string;
  /**
   * Object containing acquirer data used for AReq construction. Recommended to ensure the authentication matches the final authorization.
   */
  acquirer_details?: {
    /**
     * The Acquirer BIN.
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
     * 3DS Requestor ID (if required by directory server).
     */
    requestor_id?: string;
  };
  payment_method: PaymentMethod;
  amount: Amount;
  channel?: Channel;
  /**
   * Checkout session identifier
   */
  checkout_session_id?: string;
  flow_preference?: FlowPreference;
  /**
   * URL for challenge result callback
   */
  challenge_notification_url?: string;
  shopper_details?: ShopperDetails;
}
/**
 * Request body for completing authentication after action.
 *
 * This interface was referenced by `DelegateAuthenticationSchemaBundle`'s JSON-Schema
 * via the `definition` "DelegateAuthenticationAuthenticateRequest".
 */
export interface DelegateAuthenticationAuthenticateRequest {
  /**
   * Result of the 3DS Method fingerprint: Y = Completed successfully, N = Timeout/not completed, U = Unavailable/not performed
   */
  fingerprint_completion: "Y" | "N" | "U";
  channel?: Channel;
  /**
   * Checkout session identifier
   */
  checkout_session_id?: string;
  /**
   * URL for challenge result callback
   */
  challenge_notification_url?: string;
  shopper_details?: ShopperDetails;
}
/**
 * Base properties for an authentication session response.
 *
 * This interface was referenced by `DelegateAuthenticationSchemaBundle`'s JSON-Schema
 * via the `definition` "DelegateAuthenticationSessionBase".
 */
export interface DelegateAuthenticationSessionBase {
  /**
   * Session ID for subsequent requests
   */
  authentication_session_id: string;
  /**
   * Session status indicating current state and next action
   */
  status:
    | "action_required"
    | "pending"
    | "not_supported"
    | "authenticated"
    | "attempted"
    | "not_authenticated"
    | "rejected"
    | "unavailable"
    | "expired"
    | "challenge_abandoned";
  action?: Action;
}
/**
 * Standard error response format.
 *
 * This interface was referenced by `DelegateAuthenticationSchemaBundle`'s JSON-Schema
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
  code: "invalid_card" | "duplicate_request" | "idempotency_conflict";
  /**
   * Human-readable error message
   */
  message: string;
  /**
   * JSONPath of offending field
   */
  param?: string;
}
