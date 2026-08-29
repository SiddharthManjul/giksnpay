/**
 * Generated from the vendored official ACP 2026-04-17 JSON Schema.
 * Source: protocol/acp/2026-04-17/spec/json-schema/schema.extension.json
 * Source SHA-256: 08a4415d66413e712f5a9ceb9fbe651f9a8e4c5c795ce1f7019ffda7d238cfd4
 * Do not edit by hand. Run `pnpm --filter @mindpay/protocol-acp generate`.
 */

/**
 * Extension identifier. Core extensions use simple names (e.g., 'discount'). Third-party extensions use reverse-domain naming (e.g., 'com.example.custom'). May include optional version suffix (e.g., 'discount@2026-01-27').
 *
 * This interface was referenced by `ACPExtensionSchema`'s JSON-Schema
 * via the `definition` "extension_identifier".
 */
export type ExtensionIdentifier = string;
/**
 * JSONPath expression identifying the schema field added by this extension. Format: $.<SchemaName>.<fieldName> (e.g., $.CheckoutSession.discounts).
 *
 * This interface was referenced by `ACPExtensionSchema`'s JSON-Schema
 * via the `definition` "extends_target".
 */
export type ExtendsTarget = string;
/**
 * Extensions the agent understands. Sent in request capabilities.extensions.
 *
 * This interface was referenced by `ACPExtensionSchema`'s JSON-Schema
 * via the `definition` "request_extensions".
 */
export type RequestExtensions = ExtensionIdentifier[];
/**
 * Active extensions for this session. Returned in response capabilities.extensions.
 *
 * This interface was referenced by `ACPExtensionSchema`'s JSON-Schema
 * via the `definition` "response_extensions".
 */
export type ResponseExtensions = ExtensionDeclaration[];

/**
 * Schema definitions for the ACP Extensions Framework. Extensions are optional, composable capabilities declared in capabilities.extensions.
 */
export interface ACPExtensionSchema {
  [k: string]: unknown | undefined;
}
/**
 * Extension declaration in capabilities.extensions (response). Describes an active extension and which schema fields it adds.
 *
 * This interface was referenced by `ACPExtensionSchema`'s JSON-Schema
 * via the `definition` "extension_declaration".
 */
export interface ExtensionDeclaration {
  /**
   * Unique identifier for the extension.
   */
  name: string;
  /**
   * JSONPath expressions identifying the schema fields added by this extension (e.g., $.CheckoutSession.discounts).
   */
  extends?: ExtendsTarget[];
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
 * Full metadata about an extension for documentation and discovery.
 *
 * This interface was referenced by `ACPExtensionSchema`'s JSON-Schema
 * via the `definition` "extension_metadata".
 */
export interface ExtensionMetadata {
  /**
   * Extension identifier. Core extensions use simple names (e.g., 'discount'). Third-party extensions use reverse-domain naming (e.g., 'com.example.custom'). May include optional version suffix (e.g., 'discount@2026-01-27').
   */
  id: string;
  /**
   * Human-readable name for the extension.
   */
  name: string;
  /**
   * Brief description of what the extension provides.
   */
  description?: string;
  /**
   * JSONPath expressions identifying the schema fields added by this extension.
   */
  extends?: ExtendsTarget[];
  /**
   * URL to the extension specification document.
   */
  spec?: string;
  /**
   * URL to the extension JSON Schema.
   */
  schema?: string;
  /**
   * Lifecycle status of the extension.
   */
  status?: "draft" | "experimental" | "stable" | "deprecated" | "retired";
  /**
   * Extensions that this extension depends on.
   */
  depends_on?: ExtensionIdentifier[];
  [k: string]: unknown | undefined;
}
/**
 * Registry of core ACP extensions.
 *
 * This interface was referenced by `ACPExtensionSchema`'s JSON-Schema
 * via the `definition` "core_extensions".
 */
export interface CoreExtensions {
  discount?: ExtensionMetadata & {
    id?: "discount";
    name?: "Discount Extension";
    description?: "Discount code support with rich applied discounts, allocation details, and rejection messaging.";
    extends?: [
      "$.CheckoutSessionCreateRequest.discounts",
      "$.CheckoutSessionUpdateRequest.discounts",
      "$.CheckoutSession.discounts"
    ];
    [k: string]: unknown | undefined;
  };
  [k: string]: unknown | undefined;
}
