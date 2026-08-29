import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type {
  AuthenticationResult,
  CancelSessionRequest,
  CheckoutSession,
  CheckoutSessionCompleteRequest,
  CheckoutSessionCreateRequest,
  CheckoutSessionUpdateRequest,
  CheckoutSessionWithOrder,
  DiscoveryResponse,
  Error as CheckoutError,
  Order,
} from "./generated/agentic-checkout";
import type { Cart, CartCreateRequest, CartUpdateRequest } from "./generated/cart";
import type {
  DelegateAuthenticationAuthenticateRequest,
  DelegateAuthenticationCreateRequest,
  DelegateAuthenticationSession,
  DelegateAuthenticationSessionWithResult,
  Error as DelegateAuthenticationError,
} from "./generated/delegate-authentication";
import type {
  DelegatePaymentRequest,
  DelegatePaymentResponse,
  Error as DelegatePaymentError,
} from "./generated/delegate-payment";
import type {
  CreateFeedRequest,
  Error as FeedError,
  FeedMetadata,
  ProductsResponse,
  UpsertProductsRequest,
} from "./generated/feed";
import { acpSchemaBundles } from "./generated/schema-bundles";

const schemaIds = {
  agenticCheckout: "https://example.com/schemas/agentic-checkout/bundle.schema.json",
  cart: "https://example.com/schemas/cart/bundle.schema.json",
  delegateAuthentication: "https://example.com/schemas/delegate-authentication/bundle.schema.json",
  delegatePayment: "https://example.com/schemas/delegate-payment/bundle.schema.json",
  feed: "https://example.com/schemas/feed/bundle.schema.json",
} as const;

export const acpSchemaReferences = {
  authenticationResult: `${schemaIds.agenticCheckout}#/$defs/AuthenticationResult`,
  cancelSessionRequest: `${schemaIds.agenticCheckout}#/$defs/CancelSessionRequest`,
  cart: `${schemaIds.cart}#/$defs/Cart`,
  cartCreateRequest: `${schemaIds.cart}#/$defs/CartCreateRequest`,
  cartUpdateRequest: `${schemaIds.cart}#/$defs/CartUpdateRequest`,
  checkoutError: `${schemaIds.agenticCheckout}#/$defs/Error`,
  checkoutSession: `${schemaIds.agenticCheckout}#/$defs/CheckoutSession`,
  checkoutSessionCompleteRequest: `${schemaIds.agenticCheckout}#/$defs/CheckoutSessionCompleteRequest`,
  checkoutSessionCreateRequest: `${schemaIds.agenticCheckout}#/$defs/CheckoutSessionCreateRequest`,
  checkoutSessionUpdateRequest: `${schemaIds.agenticCheckout}#/$defs/CheckoutSessionUpdateRequest`,
  checkoutSessionWithOrder: `${schemaIds.agenticCheckout}#/$defs/CheckoutSessionWithOrder`,
  delegateAuthenticationAuthenticateRequest: `${schemaIds.delegateAuthentication}#/$defs/DelegateAuthenticationAuthenticateRequest`,
  delegateAuthenticationCreateRequest: `${schemaIds.delegateAuthentication}#/$defs/DelegateAuthenticationCreateRequest`,
  delegateAuthenticationError: `${schemaIds.delegateAuthentication}#/$defs/Error`,
  delegateAuthenticationSession: `${schemaIds.delegateAuthentication}#/$defs/DelegateAuthenticationSession`,
  delegateAuthenticationSessionWithResult: `${schemaIds.delegateAuthentication}#/$defs/DelegateAuthenticationSessionWithResult`,
  delegatePaymentError: `${schemaIds.delegatePayment}#/$defs/Error`,
  delegatePaymentRequest: `${schemaIds.delegatePayment}#/$defs/DelegatePaymentRequest`,
  delegatePaymentResponse: `${schemaIds.delegatePayment}#/$defs/DelegatePaymentResponse`,
  discoveryResponse: `${schemaIds.agenticCheckout}#/$defs/DiscoveryResponse`,
  feedCreateRequest: `${schemaIds.feed}#/$defs/CreateFeedRequest`,
  feedError: `${schemaIds.feed}#/$defs/Error`,
  feedMetadata: `${schemaIds.feed}#/$defs/FeedMetadata`,
  feedProductsResponse: `${schemaIds.feed}#/$defs/ProductsResponse`,
  feedUpsertProductsRequest: `${schemaIds.feed}#/$defs/UpsertProductsRequest`,
  order: `${schemaIds.agenticCheckout}#/$defs/Order`,
} as const;

export type AcpSchemaName = keyof typeof acpSchemaReferences;

export interface AcpSchemaTypeMap {
  authenticationResult: AuthenticationResult;
  cancelSessionRequest: CancelSessionRequest;
  cart: Cart;
  cartCreateRequest: CartCreateRequest;
  cartUpdateRequest: CartUpdateRequest;
  checkoutError: CheckoutError;
  checkoutSession: CheckoutSession;
  checkoutSessionCompleteRequest: CheckoutSessionCompleteRequest;
  checkoutSessionCreateRequest: CheckoutSessionCreateRequest;
  checkoutSessionUpdateRequest: CheckoutSessionUpdateRequest;
  checkoutSessionWithOrder: CheckoutSessionWithOrder;
  delegateAuthenticationAuthenticateRequest: DelegateAuthenticationAuthenticateRequest;
  delegateAuthenticationCreateRequest: DelegateAuthenticationCreateRequest;
  delegateAuthenticationError: DelegateAuthenticationError;
  delegateAuthenticationSession: DelegateAuthenticationSession;
  delegateAuthenticationSessionWithResult: DelegateAuthenticationSessionWithResult;
  delegatePaymentError: DelegatePaymentError;
  delegatePaymentRequest: DelegatePaymentRequest;
  delegatePaymentResponse: DelegatePaymentResponse;
  discoveryResponse: DiscoveryResponse;
  feedCreateRequest: CreateFeedRequest;
  feedError: FeedError;
  feedMetadata: FeedMetadata;
  feedProductsResponse: ProductsResponse;
  feedUpsertProductsRequest: UpsertProductsRequest;
  order: Order;
}

export interface AcpValidationError {
  instancePath: string;
  keyword: string;
  message?: string;
  params: Readonly<Record<string, unknown>>;
  schemaPath: string;
}

export type AcpValidationResult =
  | { readonly success: true }
  | { readonly errors: readonly AcpValidationError[]; readonly success: false };

const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: true });
addFormats(ajv);

for (const schema of Object.values(acpSchemaBundles)) {
  ajv.addSchema(schema);
}

const validators = new Map<AcpSchemaName, ValidateFunction>();

export function validateAcpSchema<K extends AcpSchemaName>(
  schemaName: K,
  value: unknown,
): AcpValidationResult {
  const validator = getValidator(schemaName);
  if (validator(value)) {
    return { success: true };
  }

  return {
    errors: (validator.errors ?? []).map(toValidationError),
    success: false,
  };
}

export function isAcpSchema<K extends AcpSchemaName>(
  schemaName: K,
  value: unknown,
): value is AcpSchemaTypeMap[K] {
  return validateAcpSchema(schemaName, value).success;
}

export function assertAcpSchema<K extends AcpSchemaName>(
  schemaName: K,
  value: unknown,
): asserts value is AcpSchemaTypeMap[K] {
  const result = validateAcpSchema(schemaName, value);
  if (!result.success) {
    const detail = result.errors
      .map((error) => `${error.instancePath || "/"} ${error.message ?? error.keyword}`)
      .join("; ");
    throw new TypeError(`Invalid ACP ${schemaName}: ${detail}`);
  }
}

function getValidator(schemaName: AcpSchemaName): ValidateFunction {
  const cached = validators.get(schemaName);
  if (cached !== undefined) {
    return cached;
  }

  const reference = acpSchemaReferences[schemaName];
  const validator = ajv.getSchema(reference);
  if (validator === undefined) {
    throw new Error(`ACP schema reference is unavailable: ${reference}`);
  }
  validators.set(schemaName, validator);
  return validator;
}

function toValidationError(error: ErrorObject): AcpValidationError {
  return {
    instancePath: error.instancePath,
    keyword: error.keyword,
    ...(error.message === undefined ? {} : { message: error.message }),
    params: error.params,
    schemaPath: error.schemaPath,
  };
}
