/**
 * Generated from the vendored official ACP 2026-04-17 JSON Schemas.
 * Do not edit by hand. Run `pnpm --filter @mindpay/protocol-acp generate`.
 */

export type AcpSchemaBundleName = "agenticCheckout" | "cart" | "delegateAuthentication" | "delegatePayment" | "discount" | "extension" | "feed";

export const acpSchemaBundles: Readonly<
  Record<AcpSchemaBundleName, Readonly<Record<string, unknown>>>
> = Object.freeze({
  agenticCheckout: {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.com/schemas/agentic-checkout/bundle.schema.json",
  "title": "Agentic Checkout — Schema Bundle",
  "$defs": {
    "VariantOption": {
      "description": "Represents a single variant option for a product (e.g., size, color, material)",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string",
          "description": "Variant attribute name (e.g., 'Size', 'Color')"
        },
        "value": {
          "type": "string",
          "description": "Variant attribute value (e.g., 'Large', 'Blue')"
        }
      },
      "required": [
        "name",
        "value"
      ],
      "example": {
        "name": "Color",
        "value": "Midnight Blue"
      }
    },
    "WeightInfo": {
      "description": "Product weight with unit of measurement",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "value": {
          "type": "number",
          "description": "Numeric weight value"
        },
        "unit": {
          "type": "string",
          "enum": [
            "g",
            "kg",
            "oz",
            "lb"
          ],
          "description": "Unit of measurement for weight"
        }
      },
      "required": [
        "value",
        "unit"
      ],
      "example": {
        "value": 250,
        "unit": "g"
      }
    },
    "DimensionsInfo": {
      "description": "Physical dimensions of a product with unit of measurement",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "length": {
          "type": "number",
          "description": "Length dimension"
        },
        "width": {
          "type": "number",
          "description": "Width dimension"
        },
        "height": {
          "type": "number",
          "description": "Height dimension"
        },
        "unit": {
          "type": "string",
          "enum": [
            "cm",
            "in"
          ],
          "description": "Unit of measurement for dimensions"
        }
      },
      "required": [
        "length",
        "width",
        "height",
        "unit"
      ],
      "example": {
        "length": 15.5,
        "width": 10.2,
        "height": 5.8,
        "unit": "cm"
      }
    },
    "DiscountDetail": {
      "description": "Information about a discount applied to the checkout or a specific item",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "code": {
          "type": "string",
          "description": "Discount code if applicable"
        },
        "type": {
          "type": "string",
          "enum": [
            "percentage",
            "fixed",
            "bogo",
            "volume"
          ],
          "description": "Type of discount"
        },
        "amount": {
          "type": "integer",
          "description": "Discount amount in minor currency units (e.g. 100 cents for $1.00 or 100 for ¥100)"
        },
        "description": {
          "type": "string",
          "description": "Human-readable discount description"
        },
        "source": {
          "type": "string",
          "enum": [
            "coupon",
            "automatic",
            "loyalty"
          ],
          "description": "Source of the discount"
        }
      },
      "required": [
        "type",
        "amount"
      ],
      "example": {
        "code": "SAVE20",
        "type": "percentage",
        "amount": 1600,
        "description": "20% off your order",
        "source": "coupon"
      }
    },
    "Address": {
      "description": "Physical address for shipping, billing, or pickup locations",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string",
          "description": "Recipient name for this address"
        },
        "line_one": {
          "type": "string",
          "description": "Primary street address line"
        },
        "line_two": {
          "type": "string",
          "description": "Secondary address line (apartment, suite, etc.)"
        },
        "city": {
          "type": "string",
          "description": "City name"
        },
        "state": {
          "type": "string",
          "description": "State or province code"
        },
        "country": {
          "type": "string",
          "description": "ISO 3166-1 alpha-2 country code"
        },
        "postal_code": {
          "type": "string",
          "description": "Postal or ZIP code"
        },
        "company": {
          "type": "string",
          "description": "Postal or ZIP code"
        }
      },
      "required": [
        "name",
        "line_one",
        "city",
        "state",
        "country",
        "postal_code"
      ],
      "example": {
        "name": "Jane Doe",
        "line_one": "123 Main Street",
        "line_two": "Apt 4B",
        "city": "New York",
        "state": "NY",
        "country": "US",
        "postal_code": "10001"
      }
    },
    "AffiliateAttributionSource": {
      "type": "object",
      "additionalProperties": false,
      "description": "Context about where the attribution originated.",
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "url",
            "platform",
            "unknown"
          ],
          "description": "The type of attribution source."
        },
        "url": {
          "type": "string",
          "format": "uri",
          "description": "Canonical content URL when type is 'url'."
        }
      },
      "required": [
        "type"
      ],
      "example": {
        "type": "url",
        "url": "https://example.com/product-review"
      }
    },
    "AffiliateAttributionMetadata": {
      "type": "object",
      "additionalProperties": {
        "oneOf": [
          {
            "type": "string",
            "description": "String metadata value"
          },
          {
            "type": "number",
            "description": "Numeric metadata value"
          },
          {
            "type": "boolean",
            "description": "Boolean metadata value"
          }
        ]
      },
      "description": "Flat key/value map for additional non-sensitive context. Keys must be strings; values must be strings, numbers, or booleans. Arrays and nested objects are NOT permitted.",
      "example": {
        "campaign_type": "influencer",
        "commission_rate": 0.15,
        "is_verified": true
      }
    },
    "AffiliateAttribution": {
      "type": "object",
      "description": "Optional affiliate attribution data for crediting third-party publishers. Write-only: not returned in responses. Forward compatibility: Servers SHOULD ignore unknown fields to support future extensions (per RFC §8.2).",
      "properties": {
        "provider": {
          "type": "string",
          "description": "Identifier for the attribution provider / affiliate network namespace (e.g., 'impact.com')."
        },
        "token": {
          "type": "string",
          "description": "Opaque provider-issued token for fraud-resistant validation. Treat as secret."
        },
        "publisher_id": {
          "type": "string",
          "description": "Provider-scoped affiliate/publisher identifier. Required if token is omitted."
        },
        "campaign_id": {
          "type": "string",
          "description": "Provider-scoped campaign identifier."
        },
        "creative_id": {
          "type": "string",
          "description": "Provider-scoped creative identifier."
        },
        "sub_id": {
          "type": "string",
          "description": "Provider-scoped sub-tracking identifier."
        },
        "source": {
          "$ref": "#/$defs/AffiliateAttributionSource"
        },
        "issued_at": {
          "type": "string",
          "format": "date-time",
          "description": "RFC3339 timestamp when the attribution token was issued."
        },
        "expires_at": {
          "type": "string",
          "format": "date-time",
          "description": "RFC3339 timestamp when the attribution token expires."
        },
        "metadata": {
          "$ref": "#/$defs/AffiliateAttributionMetadata"
        },
        "touchpoint": {
          "type": "string",
          "enum": [
            "first",
            "last"
          ],
          "description": "Attribution touchpoint type. Use 'first' when capturing at session creation, 'last' when capturing at completion. Enables multi-touch attribution models."
        }
      },
      "required": [
        "provider"
      ],
      "anyOf": [
        {
          "required": [
            "token"
          ]
        },
        {
          "required": [
            "publisher_id"
          ]
        }
      ],
      "example": {
        "provider": "impact.com",
        "token": "atp_01J8Z3WXYZ9ABC",
        "publisher_id": "pub_123",
        "campaign_id": "camp_summer2026",
        "touchpoint": "first",
        "source": {
          "type": "url",
          "url": "https://example.com/product-review"
        },
        "issued_at": "2026-02-11T10:00:00Z",
        "expires_at": "2026-02-11T11:00:00Z"
      }
    },
    "FulfillmentDetails": {
      "description": "Details about how items will be fulfilled (shipping, pickup, or delivery information)",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string",
          "description": "Full name for fulfillment contact"
        },
        "phone_number": {
          "type": "string",
          "description": "Contact phone number. E.164 format recommended (e.g., +15551234567) for global interoperability and SMS/delivery carrier systems."
        },
        "email": {
          "type": "string",
          "format": "email",
          "description": "Contact email address"
        },
        "address": {
          "$ref": "#/$defs/Address",
          "description": "Fulfillment address"
        }
      },
      "example": {
        "name": "John Smith",
        "phone_number": "15551234567",
        "email": "john.smith@example.com",
        "address": {
          "name": "John Smith",
          "line_one": "555 Golden Gate Avenue",
          "line_two": "Apt 401",
          "city": "San Francisco",
          "state": "CA",
          "country": "US",
          "postal_code": "94102"
        }
      }
    },
    "CompanyInfo": {
      "description": "Information about a company or organization associated with the buyer",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string",
          "description": "Company or organization name"
        },
        "tax_id": {
          "type": "string",
          "description": "Business tax identification number"
        },
        "department": {
          "type": "string",
          "description": "Department within the organization"
        },
        "cost_center": {
          "type": "string",
          "description": "Cost center code for internal accounting"
        }
      },
      "required": [
        "name"
      ],
      "example": {
        "name": "Acme Corporation",
        "tax_id": "12-3456789",
        "department": "Marketing",
        "cost_center": "CC-2001"
      }
    },
    "LoyaltyInfo": {
      "description": "Loyalty program information including membership details and rewards balance",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "tier": {
          "type": "string",
          "description": "Loyalty program tier level"
        },
        "points_balance": {
          "type": "integer",
          "description": "Current loyalty points balance"
        },
        "member_since": {
          "type": "string",
          "format": "date-time",
          "description": "RFC 3339 timestamp when the customer joined the loyalty program"
        }
      },
      "example": {
        "tier": "Gold",
        "points_balance": 5000,
        "member_since": "2024-01-15T09:00:00Z"
      }
    },
    "TaxExemption": {
      "description": "Tax exemption information including exemption type and applicable regions",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "certificate_id": {
          "type": "string",
          "description": "Unique identifier for the tax exemption certificate"
        },
        "certificate_type": {
          "type": "string",
          "enum": [
            "resale",
            "exempt_organization",
            "government"
          ],
          "description": "Type of tax exemption certificate"
        },
        "exempt_regions": {
          "type": "array",
          "items": {
            "type": "string",
            "description": "Region code where tax exemption applies (e.g., state abbreviation)"
          },
          "description": "List of regions where the exemption applies (e.g., state codes)"
        },
        "expires_at": {
          "type": "string",
          "format": "date-time",
          "description": "RFC 3339 timestamp when the exemption certificate expires"
        }
      },
      "required": [
        "certificate_id",
        "certificate_type"
      ],
      "example": {
        "certificate_id": "cert_12345",
        "certificate_type": "resale",
        "exempt_regions": [
          "CA",
          "NY",
          "TX"
        ],
        "expires_at": "2027-12-31T23:59:59Z"
      }
    },
    "Buyer": {
      "description": "Information about the buyer including contact details, company info, and loyalty status",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "first_name": {
          "type": "string",
          "description": "Buyer's first name"
        },
        "last_name": {
          "type": "string",
          "description": "Buyer's last name"
        },
        "full_name": {
          "type": "string",
          "description": "Buyer's full name"
        },
        "email": {
          "type": "string",
          "format": "email",
          "description": "Buyer's email address"
        },
        "phone_number": {
          "type": "string",
          "description": "Buyer's phone number"
        },
        "customer_id": {
          "type": "string",
          "description": "Merchant's internal customer identifier"
        },
        "account_type": {
          "type": "string",
          "enum": [
            "guest",
            "registered",
            "business"
          ],
          "description": "Type of buyer account"
        },
        "authentication_status": {
          "type": "string",
          "enum": [
            "authenticated",
            "guest",
            "requires_signin"
          ],
          "description": "Buyer's authentication status"
        },
        "company": {
          "$ref": "#/$defs/CompanyInfo",
          "description": "Company information for business buyers"
        },
        "loyalty": {
          "$ref": "#/$defs/LoyaltyInfo",
          "description": "Loyalty program information"
        },
        "tax_exemption": {
          "$ref": "#/$defs/TaxExemption",
          "description": "Tax exemption details"
        }
      },
      "required": [
        "email"
      ],
      "example": {
        "first_name": "Sarah",
        "last_name": "Johnson",
        "full_name": "Sarah Johnson",
        "email": "sarah.johnson@example.com",
        "phone_number": "+1-415-555-0123",
        "customer_id": "cust_abc123",
        "account_type": "registered",
        "authentication_status": "authenticated"
      }
    },
    "InterventionCapabilities": {
      "type": "object",
      "additionalProperties": false,
      "description": "Intervention capabilities. Context-specific fields: display_context, redirect_context, max_redirects, max_interaction_depth (requests only). required, enforcement (responses only). supported field contains intersection in responses.",
      "properties": {
        "supported": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "3ds",
              "biometric",
              "address_verification"
            ]
          },
          "description": "Intervention types supported. Agent request: Interventions the agent can handle. Seller response: Intersection of supported interventions."
        },
        "required": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "3ds",
              "biometric"
            ]
          },
          "description": "Intervention methods required for this session (seller only)."
        },
        "enforcement": {
          "type": "string",
          "enum": [
            "always",
            "conditional",
            "optional"
          ],
          "description": "When required interventions are enforced (seller only)."
        },
        "display_context": {
          "type": "string",
          "enum": [
            "native",
            "webview",
            "modal",
            "redirect"
          ],
          "description": "How the Agent presents interventions (agent only)."
        },
        "redirect_context": {
          "type": "string",
          "enum": [
            "in_app",
            "external_browser",
            "none"
          ],
          "description": "How the Agent handles redirects (agent only)."
        },
        "max_redirects": {
          "type": "integer",
          "minimum": 0,
          "description": "Maximum number of redirects the Agent can handle (agent only)."
        },
        "max_interaction_depth": {
          "type": "integer",
          "minimum": 1,
          "description": "Maximum depth of nested interactions the Agent can handle (agent only)."
        }
      },
      "example": {
        "supported": [
          "3ds",
          "address_verification"
        ],
        "display_context": "native",
        "redirect_context": "in_app",
        "max_redirects": 3,
        "max_interaction_depth": 2
      }
    },
    "Capabilities": {
      "type": "object",
      "additionalProperties": false,
      "description": "Capabilities object used in requests and responses. Context determines the party: requests are from Agents, responses are from Sellers. Seller responses contain the intersection of supported interventions.",
      "properties": {
        "payment": {
          "$ref": "#/$defs/Payment"
        },
        "interventions": {
          "$ref": "#/$defs/InterventionCapabilities"
        },
        "extensions": {
          "oneOf": [
            {
              "type": "array",
              "items": {
                "type": "string",
                "description": "Extension identifier string"
              },
              "uniqueItems": true,
              "description": "Extensions the agent understands (request). Simple identifiers like 'discount'."
            },
            {
              "type": "array",
              "items": {
                "$ref": "#/$defs/ExtensionDeclaration"
              },
              "uniqueItems": true,
              "description": "Active extensions for this session (response). Objects with name, extends, schema, spec."
            }
          ],
          "description": "Extensions supported by the party. Requests: array of extension identifiers. Responses: array of extension declaration objects."
        }
      },
      "example": {
        "interventions": {
          "supported": [
            "3ds"
          ],
          "display_context": "native"
        },
        "extensions": [
          "discount",
          "affiliate_attribution"
        ]
      }
    },
    "ExtensionDeclaration": {
      "type": "object",
      "additionalProperties": false,
      "description": "Extension declaration in capabilities.extensions (response). Describes an active extension and which schema fields it adds.",
      "required": [
        "name"
      ],
      "properties": {
        "name": {
          "type": "string",
          "pattern": "^[a-z][a-z0-9_-]*(@\\d{4}-\\d{2}-\\d{2})?$|^[a-z][a-z0-9]*(?:\\.[a-z][a-z0-9_-]*)+(@\\d{4}-\\d{2}-\\d{2})?$",
          "description": "Unique identifier for the extension."
        },
        "extends": {
          "type": "array",
          "items": {
            "type": "string",
            "pattern": "^\\$\\.[A-Za-z][A-Za-z0-9]*(\\.[A-Za-z][A-Za-z0-9_]*)*$",
            "description": "JSONPath expression identifying a schema field added by this extension"
          },
          "uniqueItems": true,
          "description": "JSONPath expressions identifying the schema fields added by this extension. Format: $.<SchemaName>.<fieldName> (e.g., $.CheckoutSession.discounts)."
        },
        "schema": {
          "type": "string",
          "format": "uri",
          "description": "URL to the extension's JSON Schema definition."
        },
        "spec": {
          "type": "string",
          "format": "uri",
          "description": "URL to the extension's specification document."
        }
      },
      "example": {
        "name": "discount",
        "extends": [
          "$.CheckoutSession.discounts",
          "$.CheckoutSessionCreateRequest.coupons"
        ],
        "schema": "https://example.com/schemas/extensions/discount.schema.json",
        "spec": "https://example.com/specs/extensions/discount"
      }
    },
    "PaymentMethodObject": {
      "type": "object",
      "additionalProperties": false,
      "description": "Payment method with additional constraints (e.g., card brands, PSP routing)",
      "properties": {
        "method": {
          "type": "string",
          "description": "The payment method identifier"
        },
        "brands": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "visa",
              "mastercard",
              "amex",
              "discover",
              "diners",
              "jcb",
              "unionpay",
              "eftpos",
              "interac"
            ]
          },
          "description": "Specific card brands/networks accepted"
        },
        "funding_types": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "credit",
              "debit",
              "prepaid"
            ]
          },
          "description": "For card methods, funding types accepted"
        },
        "providers": {
          "type": "array",
          "items": {
            "type": "string",
            "description": "Payment service provider identifier"
          },
          "description": "Optional PSP routing information"
        }
      },
      "required": [
        "method"
      ],
      "example": {
        "method": "card",
        "brands": [
          "visa",
          "mastercard"
        ],
        "providers": [
          "stripe",
          "adyen"
        ]
      }
    },
    "Item": {
      "description": "A purchasable item with variant options (e.g., size, color) and quantity",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "description": "Unique identifier for the item"
        },
        "name": {
          "type": "string",
          "description": "Display name of the item"
        },
        "unit_amount": {
          "type": "integer",
          "description": "Price per unit in minor currency units (e.g. 100 cents for $1.00 or 100 for ¥100)"
        }
      },
      "required": [
        "id"
      ],
      "example": {
        "id": "item_123",
        "name": "Wireless Headphones",
        "unit_amount": 7999
      }
    },
    "Disclosure": {
      "description": "Legal disclosure or terms that must be acknowledged by the buyer",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "disclaimer"
          ],
          "description": "Type of disclosure"
        },
        "content_type": {
          "type": "string",
          "enum": [
            "plain",
            "markdown"
          ],
          "description": "Format of the disclosure content. When set to 'markdown', content MUST conform to CommonMark (https://spec.commonmark.org/0.31.2/). Raw HTML elements MUST NOT be included. When set to 'plain', content is plain text with no formatting."
        },
        "content": {
          "type": "string",
          "description": "The disclosure text content. When content_type is 'markdown', this MUST be valid CommonMark with no raw HTML. Agents MUST render using a CommonMark-compliant parser with raw HTML output disabled or sanitized."
        }
      },
      "required": [
        "type",
        "content_type",
        "content"
      ],
      "example": {
        "type": "disclaimer",
        "content_type": "plain",
        "content": "This product contains small parts and is not suitable for children under 3 years."
      }
    },
    "CustomAttribute": {
      "description": "Custom key-value attribute for merchant-specific metadata on line items",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "display_name": {
          "type": "string",
          "description": "Human-readable label for the attribute"
        },
        "value": {
          "type": "string",
          "description": "Attribute value"
        }
      },
      "required": [
        "display_name",
        "value"
      ],
      "example": {
        "display_name": "Engraving",
        "value": "Happy Birthday!"
      }
    },
    "MarketplaceSellerDetails": {
      "description": "Information about a third-party seller in a marketplace model",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string",
          "description": "Name of the marketplace seller or vendor"
        }
      },
      "required": [
        "name"
      ],
      "example": {
        "name": "TechGear Store"
      }
    },
    "PaymentHandler": {
      "type": "object",
      "additionalProperties": false,
      "description": "Payment handler configuration and capabilities",
      "properties": {
        "id": {
          "type": "string",
          "description": "Seller-defined handler identifier"
        },
        "name": {
          "type": "string",
          "description": "Handler name in reverse-DNS format (e.g., dev.acp.tokenized.card)"
        },
        "display_name": {
          "type": "string",
          "description": "Human-readable name for UI (e.g., Credit Card). Use when showing payment options to the buyer."
        },
        "version": {
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
          "description": "Handler version in YYYY-MM-DD format"
        },
        "spec": {
          "type": "string",
          "format": "uri",
          "description": "URL to handler specification"
        },
        "requires_delegate_payment": {
          "type": "boolean",
          "description": "Whether this handler requires using delegate_payment API"
        },
        "requires_pci_compliance": {
          "type": "boolean",
          "description": "Whether this handler routes PCI DSS sensitive data"
        },
        "psp": {
          "type": "string",
          "description": "Payment Service Provider identifier"
        },
        "config_schema": {
          "type": "string",
          "format": "uri",
          "description": "URL to JSON Schema for handler configuration"
        },
        "instrument_schemas": {
          "type": "array",
          "items": {
            "type": "string",
            "format": "uri",
            "description": "URL to a JSON Schema defining accepted payment instrument format"
          },
          "description": "URLs to JSON Schemas for payment instruments"
        },
        "config": {
          "type": "object",
          "description": "Handler-specific configuration"
        },
        "display_order": {
          "type": "integer",
          "description": "Optional merchant-suggested display order (lower = higher preference). Suggestive only; platform/agent MAY reorder."
        }
      },
      "required": [
        "id",
        "name",
        "version",
        "spec",
        "requires_delegate_payment",
        "requires_pci_compliance",
        "psp",
        "config_schema",
        "instrument_schemas",
        "config"
      ],
      "example": {
        "id": "handler_stripe_01",
        "name": "Stripe",
        "type": "direct",
        "instrument_schemas": [
          "https://example.com/schemas/payment/card.json"
        ]
      }
    },
    "Payment": {
      "type": "object",
      "additionalProperties": false,
      "description": "Payment configuration with handlers",
      "properties": {
        "handlers": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/PaymentHandler"
          },
          "description": "Available payment handlers"
        }
      },
      "required": [
        "handlers"
      ],
      "example": {
        "handlers": []
      }
    },
    "LineItem": {
      "description": "A line item in the checkout representing a product with pricing, discounts, and fulfillment details",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "description": "Unique identifier for the line item"
        },
        "item": {
          "$ref": "#/$defs/Item",
          "description": "Reference to the item being purchased"
        },
        "quantity": {
          "type": "integer",
          "minimum": 1,
          "description": "Number of units for this line item"
        },
        "name": {
          "type": "string",
          "description": "Display name of the line item"
        },
        "description": {
          "type": "string",
          "description": "Detailed description of the line item"
        },
        "images": {
          "type": "array",
          "items": {
            "type": "string",
            "format": "uri",
            "description": "Image URL for the product"
          },
          "description": "Array of image URLs for this line item"
        },
        "unit_amount": {
          "type": "integer",
          "description": "The unit price of the line item in the smallest currency unit (e.g., cents for USD)"
        },
        "disclosures": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/Disclosure"
          },
          "description": "Legal disclosures or disclaimers for this item"
        },
        "custom_attributes": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/CustomAttribute"
          },
          "description": "Custom attributes specific to this line item"
        },
        "marketplace_seller_details": {
          "$ref": "#/$defs/MarketplaceSellerDetails",
          "description": "Seller details for marketplace items"
        },
        "product_id": {
          "type": "string",
          "description": "Merchant's product identifier"
        },
        "sku": {
          "type": "string",
          "description": "Stock keeping unit identifier"
        },
        "variant_id": {
          "type": "string",
          "description": "Product variant identifier"
        },
        "category": {
          "type": "string",
          "description": "Product category"
        },
        "tags": {
          "type": "array",
          "items": {
            "type": "string",
            "description": "Product tag or category"
          },
          "description": "Product tags or labels"
        },
        "weight": {
          "$ref": "#/$defs/WeightInfo",
          "description": "Weight information for the item"
        },
        "dimensions": {
          "$ref": "#/$defs/DimensionsInfo",
          "description": "Dimensions for the item"
        },
        "availability_status": {
          "type": "string",
          "enum": [
            "in_stock",
            "low_stock",
            "out_of_stock",
            "backorder",
            "pre_order"
          ],
          "description": "Current availability status of the item"
        },
        "available_quantity": {
          "type": "integer",
          "minimum": 0,
          "description": "Quantity currently available for purchase"
        },
        "max_quantity_per_order": {
          "type": "integer",
          "minimum": 1,
          "description": "Maximum quantity allowed per order"
        },
        "fulfillable_on": {
          "type": "string",
          "format": "date-time",
          "description": "RFC 3339 timestamp when item becomes available for fulfillment"
        },
        "variant_options": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/VariantOption"
          },
          "description": "Selected product variant options (e.g., size, color)"
        },
        "discount_details": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/DiscountDetail"
          },
          "description": "Line-item level discount details"
        },
        "tax_exempt": {
          "type": "boolean",
          "description": "Whether this line item is tax exempt"
        },
        "tax_exemption_reason": {
          "type": "string",
          "description": "Reason for tax exemption if applicable"
        },
        "parent_id": {
          "type": "string",
          "description": "Reference to parent line item for bundled products"
        },
        "totals": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/Total"
          },
          "description": "Line-item level totals breakdown including base_amount, discount, subtotal, tax, and total"
        }
      },
      "required": [
        "id",
        "item",
        "quantity",
        "totals"
      ],
      "example": {
        "id": "item_001",
        "product_id": "prod_tshirt_blue_m",
        "name": "Organic Cotton T-Shirt",
        "quantity": 2,
        "base_amount": 2900,
        "discount": 0,
        "subtotal": 5800,
        "tax": 464,
        "total": 6264,
        "currency": "usd",
        "image_url": "https://example.com/images/tshirt-blue.jpg"
      }
    },
    "TaxBreakdownItem": {
      "description": "Breakdown of tax amounts by type, jurisdiction, or rate",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "jurisdiction": {
          "type": "string",
          "description": "Tax jurisdiction name (e.g., 'California State Tax', 'City of San Francisco')"
        },
        "rate": {
          "type": "number",
          "description": "Tax rate as a decimal (e.g., 0.0875 for 8.75%)"
        },
        "amount": {
          "type": "integer",
          "description": "Tax amount in minor currency units (e.g. 100 cents for $1.00 or 100 for ¥100)"
        }
      },
      "required": [
        "jurisdiction",
        "rate",
        "amount"
      ],
      "example": {
        "name": "State Sales Tax",
        "amount": 464,
        "rate": 0.08
      }
    },
    "Total": {
      "description": "Total amounts for the checkout including subtotal, discounts, tax, shipping, and final total",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "items_base_amount",
            "items_discount",
            "subtotal",
            "discount",
            "fulfillment",
            "tax",
            "fee",
            "gift_wrap",
            "tip",
            "store_credit",
            "total",
            "amount_refunded"
          ],
          "description": "Type of total line item"
        },
        "display_text": {
          "type": "string",
          "description": "Localized display text for this total"
        },
        "amount": {
          "type": "integer",
          "description": "Amount in minor currency units (e.g. 100 cents for $1.00 or 100 for ¥100)"
        },
        "presentment_amount": {
          "type": "integer",
          "description": "Amount in presentment currency minor units if different from settlement currency"
        },
        "description": {
          "type": "string",
          "description": "Additional descriptive text for this total"
        },
        "breakdown": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/TaxBreakdownItem"
          },
          "description": "Detailed breakdown for tax totals"
        }
      },
      "required": [
        "type",
        "display_text",
        "amount"
      ],
      "example": {
        "currency": "usd",
        "subtotal": 5800,
        "discount": 0,
        "tax": 464,
        "shipping": 500,
        "total": 6764
      }
    },
    "FulfillmentOptionPickup": {
      "description": "In-store or curbside pickup fulfillment option with pickup location details",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "const": "pickup",
          "description": "Fulfillment type discriminator"
        },
        "id": {
          "type": "string",
          "description": "Unique identifier for this fulfillment option"
        },
        "title": {
          "type": "string",
          "description": "Display title for this pickup option"
        },
        "description": {
          "type": "string",
          "description": "Additional details about this pickup option"
        },
        "location": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "description": "Location name"
            },
            "address": {
              "$ref": "#/$defs/Address",
              "description": "Pickup address"
            },
            "phone": {
              "type": "string",
              "description": "Location phone number"
            },
            "instructions": {
              "type": "string",
              "description": "Special pickup instructions"
            }
          },
          "required": [
            "name",
            "address"
          ],
          "description": "Pickup location details"
        },
        "pickup_type": {
          "type": "string",
          "enum": [
            "in_store",
            "curbside",
            "locker"
          ],
          "description": "Type of pickup method"
        },
        "ready_by": {
          "type": "string",
          "format": "date-time",
          "description": "RFC 3339 timestamp when order will be ready for pickup"
        },
        "pickup_by": {
          "type": "string",
          "format": "date-time",
          "description": "RFC 3339 timestamp by which order must be picked up"
        },
        "totals": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/Total"
          },
          "description": "Cost breakdown for this fulfillment option"
        }
      },
      "required": [
        "type",
        "id",
        "title",
        "location",
        "totals"
      ],
      "example": {
        "id": "pickup_01",
        "type": "pickup",
        "name": "Store Pickup",
        "cost": 0,
        "currency": "usd",
        "address": {
          "name": "Downtown Store",
          "line_one": "123 Main St",
          "city": "San Francisco",
          "state": "CA",
          "country": "US",
          "postal_code": "94102"
        }
      }
    },
    "FulfillmentOptionLocalDelivery": {
      "description": "Local delivery fulfillment option with delivery address and scheduling details",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "const": "local_delivery",
          "description": "Fulfillment type discriminator"
        },
        "id": {
          "type": "string",
          "description": "Unique identifier for this fulfillment option"
        },
        "title": {
          "type": "string",
          "description": "Display title for this local delivery option"
        },
        "description": {
          "type": "string",
          "description": "Additional details about this delivery option"
        },
        "delivery_window": {
          "type": "object",
          "properties": {
            "start": {
              "type": "string",
              "format": "date-time",
              "description": "RFC 3339 timestamp for delivery window start"
            },
            "end": {
              "type": "string",
              "format": "date-time",
              "description": "RFC 3339 timestamp for delivery window end"
            }
          },
          "required": [
            "start",
            "end"
          ],
          "description": "Expected delivery time window"
        },
        "service_area": {
          "type": "object",
          "properties": {
            "radius_miles": {
              "type": "number",
              "description": "Delivery radius in miles"
            },
            "center_postal_code": {
              "type": "string",
              "description": "Center point postal code for delivery radius"
            }
          },
          "description": "Geographic service area for local delivery"
        },
        "totals": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/Total"
          },
          "description": "Cost breakdown for this fulfillment option"
        }
      },
      "required": [
        "type",
        "id",
        "title",
        "totals"
      ],
      "example": {
        "id": "delivery_01",
        "type": "local_delivery",
        "name": "Same Day Delivery",
        "cost": 999,
        "currency": "usd",
        "address": {
          "name": "Jane Doe",
          "line_one": "456 Oak Ave",
          "city": "San Francisco",
          "state": "CA",
          "country": "US",
          "postal_code": "94103"
        }
      }
    },
    "FulfillmentOptionShipping": {
      "description": "Shipping fulfillment option with carrier, service level, and delivery estimates",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "const": "shipping",
          "description": "Fulfillment type discriminator"
        },
        "id": {
          "type": "string",
          "description": "Unique identifier for this fulfillment option"
        },
        "title": {
          "type": "string",
          "description": "Display title for this shipping option (e.g., 'Standard Shipping', 'Express')"
        },
        "description": {
          "type": "string",
          "description": "Additional details about this shipping option"
        },
        "carrier": {
          "type": "string",
          "description": "Shipping carrier name (e.g., 'USPS', 'FedEx')"
        },
        "earliest_delivery_time": {
          "type": "string",
          "format": "date-time",
          "description": "RFC 3339 timestamp for earliest expected delivery"
        },
        "latest_delivery_time": {
          "type": "string",
          "format": "date-time",
          "description": "RFC 3339 timestamp for latest expected delivery"
        },
        "totals": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/Total"
          },
          "description": "Cost breakdown for this fulfillment option"
        }
      },
      "required": [
        "type",
        "id",
        "title",
        "totals"
      ],
      "example": {
        "id": "ship_01",
        "type": "shipping",
        "name": "Standard Shipping",
        "cost": 500,
        "currency": "usd",
        "carrier": "USPS",
        "service_level": "ground"
      }
    },
    "FulfillmentOptionDigital": {
      "description": "Digital delivery fulfillment option for downloadable or streaming content",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "const": "digital",
          "description": "Fulfillment type discriminator"
        },
        "id": {
          "type": "string",
          "description": "Unique identifier for this fulfillment option"
        },
        "title": {
          "type": "string",
          "description": "Display title for this digital delivery option"
        },
        "description": {
          "type": "string",
          "description": "Additional details about digital delivery method"
        },
        "totals": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/Total"
          },
          "description": "Cost breakdown for this fulfillment option"
        }
      },
      "required": [
        "type",
        "id",
        "title",
        "totals"
      ],
      "example": {
        "id": "digital_01",
        "type": "digital",
        "name": "Instant Download",
        "cost": 0,
        "currency": "usd"
      }
    },
    "SelectedFulfillmentOption": {
      "description": "Fulfillment option selected by the buyer for specific line items",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "shipping",
            "digital",
            "pickup",
            "local_delivery"
          ],
          "description": "Type of fulfillment option selected"
        },
        "option_id": {
          "type": "string",
          "description": "ID of the selected fulfillment option"
        },
        "item_ids": {
          "type": "array",
          "items": {
            "type": "string",
            "description": "Line item identifier"
          },
          "description": "List of line item IDs associated with this fulfillment option"
        }
      },
      "required": [
        "type",
        "option_id",
        "item_ids"
      ],
      "example": {
        "id": "ship_01",
        "type": "shipping",
        "item_ids": [
          "item_001",
          "item_002"
        ]
      }
    },
    "GiftWrap": {
      "description": "Gift wrapping option with associated cost and customization details",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "enabled": {
          "type": "boolean",
          "description": "Whether gift wrapping is enabled for this order"
        },
        "style": {
          "type": "string",
          "enum": [
            "birthday",
            "holiday",
            "elegant"
          ],
          "description": "Gift wrap style selected"
        },
        "charge": {
          "type": "integer",
          "description": "Additional charge for gift wrapping in minor currency units (e.g. 100 cents for $1.00 or 100 for ¥100)"
        }
      },
      "required": [
        "enabled"
      ],
      "example": {
        "available": true,
        "cost": 500,
        "currency": "usd",
        "message": "Happy Birthday!"
      }
    },
    "SplitPayment": {
      "description": "Split payment configuration allowing payment across multiple methods or parties",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "amount": {
          "type": "integer",
          "description": "Payment amount in minor currency units (e.g. 100 cents for $1.00 or 100 for ¥100) for this split"
        }
      },
      "required": [
        "amount"
      ],
      "example": {
        "enabled": true,
        "methods": [
          "card",
          "paypal"
        ]
      }
    },
    "FulfillmentGroup": {
      "description": "Group of line items that share the same fulfillment method and destination",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "description": "Unique identifier for this fulfillment group"
        },
        "item_ids": {
          "type": "array",
          "items": {
            "type": "string",
            "description": "Line item identifier in this fulfillment group"
          },
          "description": "List of line item IDs in this fulfillment group"
        },
        "destination_type": {
          "type": "string",
          "enum": [
            "shipping",
            "pickup",
            "local_delivery",
            "digital"
          ],
          "description": "Type of fulfillment for this group"
        },
        "fulfillment_details": {
          "$ref": "#/$defs/FulfillmentDetails",
          "description": "Fulfillment contact and address details"
        },
        "location_id": {
          "type": "string",
          "description": "Location identifier for pickup or local delivery"
        },
        "instructions": {
          "type": "string",
          "description": "Special fulfillment instructions"
        }
      },
      "required": [
        "id",
        "item_ids",
        "destination_type"
      ],
      "example": {
        "id": "fg_01",
        "fulfillment_option_id": "ship_01",
        "item_ids": [
          "item_001",
          "item_002"
        ]
      }
    },
    "EstimatedDelivery": {
      "description": "Estimated delivery date range for a fulfillment option",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "earliest": {
          "type": "string",
          "format": "date-time",
          "description": "RFC 3339 timestamp for earliest expected delivery"
        },
        "latest": {
          "type": "string",
          "format": "date-time",
          "description": "RFC 3339 timestamp for latest expected delivery"
        }
      },
      "required": [
        "earliest",
        "latest"
      ],
      "example": {
        "earliest": "2026-02-15",
        "latest": "2026-02-20"
      }
    },
    "OrderConfirmation": {
      "description": "Order confirmation details including order number and tracking information",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "confirmation_number": {
          "type": "string",
          "description": "Order confirmation number"
        },
        "confirmation_email_sent": {
          "type": "boolean",
          "description": "Whether a confirmation email has been sent"
        },
        "receipt_url": {
          "type": "string",
          "format": "uri",
          "description": "URL to the order receipt"
        },
        "invoice_number": {
          "type": "string",
          "description": "Invoice number if generated"
        },
        "order_notes": {
          "type": "string",
          "description": "Echo of order_notes attached to the order."
        }
      },
      "example": {
        "order_id": "ord_abc123",
        "order_number": "12345",
        "confirmation_url": "https://example.com/orders/ord_abc123"
      }
    },
    "SupportInfo": {
      "description": "Customer support contact information including email, phone, and URL",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "email": {
          "type": "string",
          "format": "email",
          "description": "Support contact email"
        },
        "phone": {
          "type": "string",
          "description": "Support contact phone number"
        },
        "hours": {
          "type": "string",
          "description": "Support hours of operation"
        },
        "help_center_url": {
          "type": "string",
          "format": "uri",
          "description": "URL to merchant's help center"
        }
      },
      "example": {
        "email": "support@example.com",
        "phone": "+1-800-555-0123",
        "url": "https://example.com/support"
      }
    },
    "MessageInfo": {
      "description": "Informational message to display to the buyer during checkout",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "const": "info",
          "description": "Message type discriminator"
        },
        "severity": {
          "type": "string",
          "enum": [
            "info",
            "low",
            "medium",
            "high",
            "critical"
          ],
          "description": "Severity level of this informational message"
        },
        "resolution": {
          "type": "string",
          "enum": [
            "recoverable",
            "requires_buyer_input",
            "requires_buyer_review"
          ],
          "description": "Who resolves this message. 'recoverable': agent can fix via API. 'requires_buyer_input': buyer must provide info. 'requires_buyer_review': buyer must authorize."
        },
        "param": {
          "type": "string",
          "description": "RFC 9535 JSONPath"
        },
        "content_type": {
          "type": "string",
          "enum": [
            "plain",
            "markdown"
          ],
          "description": "Format of the message content. When set to 'markdown', content MUST conform to CommonMark (https://spec.commonmark.org/0.31.2/). Raw HTML elements MUST NOT be included. When set to 'plain', content is plain text with no formatting."
        },
        "content": {
          "type": "string",
          "description": "Informational message text. When content_type is 'markdown', this MUST be valid CommonMark with no raw HTML. Agents MUST render using a CommonMark-compliant parser with raw HTML output disabled or sanitized."
        }
      },
      "required": [
        "type",
        "content_type",
        "content"
      ],
      "example": {
        "id": "msg_info_01",
        "message": "Free shipping on orders over $50",
        "display_context": "banner"
      }
    },
    "MessageWarning": {
      "description": "Warning message to display to the buyer during checkout (non-blocking)",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "const": "warning",
          "description": "Message type discriminator"
        },
        "code": {
          "type": "string",
          "enum": [
            "low_stock",
            "high_demand",
            "shipping_delay",
            "price_change",
            "expiring_promotion",
            "limited_availability",
            "discount_code_expired",
            "discount_code_invalid",
            "discount_code_already_applied",
            "discount_code_combination_disallowed",
            "discount_code_minimum_not_met",
            "discount_code_user_not_logged_in",
            "discount_code_user_ineligible",
            "discount_code_usage_limit_reached"
          ],
          "description": "Warning code indicating the type of warning"
        },
        "severity": {
          "type": "string",
          "enum": [
            "info",
            "low",
            "medium",
            "high",
            "critical"
          ],
          "description": "Severity level of this warning"
        },
        "resolution": {
          "type": "string",
          "enum": [
            "recoverable",
            "requires_buyer_input",
            "requires_buyer_review"
          ],
          "description": "Who resolves this message. 'recoverable': agent can fix via API. 'requires_buyer_input': buyer must provide info. 'requires_buyer_review': buyer must authorize."
        },
        "param": {
          "type": "string",
          "description": "RFC 9535 JSONPath"
        },
        "content_type": {
          "type": "string",
          "enum": [
            "plain",
            "markdown"
          ],
          "description": "Format of the warning message content. When set to 'markdown', content MUST conform to CommonMark (https://spec.commonmark.org/0.31.2/). Raw HTML elements MUST NOT be included. When set to 'plain', content is plain text with no formatting."
        },
        "content": {
          "type": "string",
          "description": "Warning message text. When content_type is 'markdown', this MUST be valid CommonMark with no raw HTML. Agents MUST render using a CommonMark-compliant parser with raw HTML output disabled or sanitized."
        }
      },
      "required": [
        "type",
        "code",
        "content_type",
        "content"
      ],
      "example": {
        "id": "msg_warn_01",
        "message": "Only 2 items left in stock",
        "code": "low_stock",
        "param": "$.items[0]"
      }
    },
    "MessageError": {
      "type": "object",
      "additionalProperties": false,
      "description": "Business-logic error within a valid CheckoutSession response. Used in messages[] on 2xx responses when the session is valid but has actionable issues (e.g. status \"not_ready_for_payment\"). The agent can respond by asking the buyer for corrections or trying alternatives. Use MessageError—not Error—when you can return a valid CheckoutSession and the problem is conversational (e.g. invalid email → code \"invalid\" and param \"$.buyer.email\"; out of stock → code \"out_of_stock\" and param \"$.items[0]\").",
      "properties": {
        "type": {
          "type": "string",
          "const": "error",
          "description": "Message type discriminator"
        },
        "code": {
          "type": "string",
          "enum": [
            "missing",
            "invalid",
            "out_of_stock",
            "payment_declined",
            "requires_sign_in",
            "requires_3ds",
            "low_stock",
            "quantity_exceeded",
            "coupon_invalid",
            "coupon_expired",
            "minimum_not_met",
            "maximum_exceeded",
            "region_restricted",
            "age_verification_required",
            "approval_required",
            "unsupported",
            "not_found",
            "conflict",
            "rate_limited",
            "expired",
            "intervention_required"
          ],
          "description": "Error code indicating the type of error"
        },
        "severity": {
          "type": "string",
          "enum": [
            "info",
            "low",
            "medium",
            "high",
            "critical"
          ],
          "description": "Severity level of this error"
        },
        "resolution": {
          "type": "string",
          "enum": [
            "recoverable",
            "requires_buyer_input",
            "requires_buyer_review"
          ],
          "description": "Who resolves this message. 'recoverable': agent can fix via API. 'requires_buyer_input': buyer must provide info. 'requires_buyer_review': buyer must authorize."
        },
        "param": {
          "type": "string",
          "description": "RFC 9535 JSONPath"
        },
        "content_type": {
          "type": "string",
          "enum": [
            "plain",
            "markdown"
          ],
          "description": "Format of the error message content. When set to 'markdown', content MUST conform to CommonMark (https://spec.commonmark.org/0.31.2/). Raw HTML elements MUST NOT be included. When set to 'plain', content is plain text with no formatting."
        },
        "content": {
          "type": "string",
          "description": "Error message text. When content_type is 'markdown', this MUST be valid CommonMark with no raw HTML. Agents MUST render using a CommonMark-compliant parser with raw HTML output disabled or sanitized."
        }
      },
      "required": [
        "type",
        "code",
        "content_type",
        "content"
      ],
      "example": {
        "id": "msg_err_01",
        "message": "Invalid email address format",
        "code": "invalid",
        "param": "$.buyer.email"
      }
    },
    "Link": {
      "description": "Hyperlink with URL, display text, and optional action semantics",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "terms_of_use",
            "privacy_policy",
            "return_policy",
            "shipping_policy",
            "contact_us",
            "about_us",
            "faq",
            "support"
          ],
          "description": "Type of link"
        },
        "title": {
          "type": "string",
          "description": "Display text for the link"
        },
        "url": {
          "type": "string",
          "format": "uri",
          "description": "URL destination"
        }
      },
      "required": [
        "type",
        "url"
      ],
      "example": {
        "url": "https://example.com/terms",
        "text": "Terms of Service",
        "action": "view"
      }
    },
    "PaymentData": {
      "description": "Payment instrument data collected from the buyer (e.g., card details, wallet tokens)",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "handler_id": {
          "type": "string",
          "description": "ID of the payment handler to use"
        },
        "instrument": {
          "type": "object",
          "description": "Payment instrument details",
          "properties": {
            "type": {
              "type": "string",
              "description": "Instrument type (e.g., card, wallet_token)"
            },
            "credential": {
              "type": "object",
              "description": "Payment credential",
              "properties": {
                "type": {
                  "type": "string",
                  "description": "Credential type (e.g., spt, wallet_token)"
                },
                "token": {
                  "type": "string",
                  "description": "Credential token value"
                }
              },
              "required": [
                "type",
                "token"
              ]
            }
          },
          "required": [
            "type",
            "credential"
          ]
        },
        "billing_address": {
          "$ref": "#/$defs/Address",
          "description": "Billing address for the payment"
        },
        "purchase_order_number": {
          "type": "string",
          "description": "Purchase order number"
        },
        "payment_terms": {
          "type": "string",
          "enum": [
            "immediate",
            "net_15",
            "net_30",
            "net_60",
            "net_90"
          ],
          "description": "Payment terms for B2B transactions"
        },
        "due_date": {
          "type": "string",
          "format": "date-time",
          "description": "RFC 3339 timestamp when payment is due"
        },
        "approval_required": {
          "type": "boolean",
          "description": "Whether this payment requires approval"
        }
      },
      "anyOf": [
        {
          "required": [
            "handler_id",
            "instrument"
          ]
        },
        {
          "required": [
            "purchase_order_number"
          ]
        }
      ],
      "example": {
        "type": "vault_token",
        "token": "vt_01J8Z3WXYZ9ABC123"
      }
    },
    "ProtocolVersion": {
      "type": "object",
      "additionalProperties": false,
      "description": "Protocol metadata included in checkout responses. Indicates the ACP version.",
      "properties": {
        "version": {
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
          "example": "2026-01-27",
          "description": "ACP protocol version in YYYY-MM-DD format."
        }
      },
      "required": [
        "version"
      ],
      "example": {
        "version": "2026-04-17"
      }
    },
    "DiscountAllocation": {
      "type": "object",
      "additionalProperties": false,
      "description": "Breakdown of how a discount amount was allocated to a specific target.",
      "required": [
        "path",
        "amount"
      ],
      "properties": {
        "path": {
          "type": "string",
          "description": "JSONPath to the allocation target (e.g., '$.line_items[0]', '$.totals.shipping')."
        },
        "amount": {
          "type": "integer",
          "minimum": 0,
          "description": "Amount allocated to this target in minor (cents) currency units."
        }
      },
      "example": {
        "target": "line_item",
        "target_id": "item_001",
        "amount": 500
      }
    },
    "Coupon": {
      "type": "object",
      "additionalProperties": false,
      "description": "Coupon details describing the discount terms.",
      "required": [
        "id",
        "name"
      ],
      "properties": {
        "id": {
          "type": "string",
          "description": "Unique identifier for the coupon."
        },
        "name": {
          "type": "string",
          "description": "Human-readable coupon name (e.g., 'Summer Sale 20% Off')."
        },
        "percent_off": {
          "type": "number",
          "minimum": 0,
          "maximum": 100,
          "description": "Percentage discount (0-100). Mutually exclusive with amount_off."
        },
        "amount_off": {
          "type": "integer",
          "minimum": 0,
          "description": "Fixed discount amount in minor currency units. Mutually exclusive with percent_off."
        },
        "currency": {
          "type": "string",
          "pattern": "^[a-z]{3}$",
          "description": "ISO 4217 currency code for amount_off. Required if amount_off is set."
        },
        "duration": {
          "type": "string",
          "enum": [
            "once",
            "repeating",
            "forever"
          ],
          "description": "How long the discount applies. 'once' = single use, 'repeating' = multiple billing periods, 'forever' = indefinitely."
        },
        "duration_in_months": {
          "type": "integer",
          "minimum": 1,
          "description": "Number of months the coupon applies if duration is 'repeating'."
        },
        "max_redemptions": {
          "type": "integer",
          "minimum": 1,
          "description": "Maximum number of times this coupon can be redeemed across all customers."
        },
        "times_redeemed": {
          "type": "integer",
          "minimum": 0,
          "description": "Number of times this coupon has been redeemed."
        },
        "metadata": {
          "type": "object",
          "additionalProperties": {
            "type": "string",
            "description": "Metadata value"
          },
          "description": "Arbitrary key-value metadata attached to the coupon."
        }
      },
      "example": {
        "code": "SAVE20",
        "metadata": {}
      }
    },
    "AppliedDiscount": {
      "type": "object",
      "additionalProperties": false,
      "description": "A discount that was successfully applied to the checkout session.",
      "required": [
        "id",
        "coupon",
        "amount"
      ],
      "properties": {
        "id": {
          "type": "string",
          "description": "Unique identifier for this applied discount instance."
        },
        "code": {
          "type": "string",
          "description": "The discount code entered by the user. Omitted for automatic discounts."
        },
        "coupon": {
          "$ref": "#/$defs/Coupon",
          "description": "Details about the underlying coupon/promotion."
        },
        "amount": {
          "type": "integer",
          "minimum": 0,
          "description": "Total discount amount in minor (cents) currency units."
        },
        "automatic": {
          "type": "boolean",
          "default": false,
          "description": "True if applied automatically by merchant rules (no code required)."
        },
        "start": {
          "type": "string",
          "format": "date-time",
          "description": "RFC 3339 timestamp when the discount became active."
        },
        "end": {
          "type": "string",
          "format": "date-time",
          "description": "RFC 3339 timestamp when the discount expires."
        },
        "method": {
          "type": "string",
          "enum": [
            "each",
            "across"
          ],
          "description": "Allocation method. 'each' = applied independently per item. 'across' = split proportionally by value."
        },
        "priority": {
          "type": "integer",
          "minimum": 1,
          "description": "Stacking order for discount calculation. Lower numbers applied first (1 = first)."
        },
        "allocations": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/DiscountAllocation"
          },
          "description": "Breakdown of where this discount was allocated. Sum of allocation amounts equals total amount."
        }
      },
      "example": {
        "code": "SAVE20",
        "amount": 1000,
        "allocations": []
      }
    },
    "DiscountsRequest": {
      "type": "object",
      "additionalProperties": false,
      "description": "Discount codes input for checkout create/update requests.",
      "properties": {
        "codes": {
          "type": "array",
          "items": {
            "type": "string",
            "description": "Discount code to apply"
          },
          "description": "Discount codes to apply. Case-insensitive. Replaces previously submitted codes. Send empty array to clear."
        }
      },
      "example": {
        "codes": [
          "SAVE20",
          "FREESHIP"
        ]
      }
    },
    "DiscountsResponse": {
      "type": "object",
      "additionalProperties": false,
      "description": "Discount codes input and applied discounts output in checkout responses.",
      "properties": {
        "codes": {
          "type": "array",
          "items": {
            "type": "string",
            "description": "Discount code submitted"
          },
          "description": "Echo of submitted discount codes."
        },
        "applied": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/AppliedDiscount"
          },
          "description": "Discounts successfully applied (code-based and automatic)."
        },
        "rejected": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/RejectedDiscount"
          },
          "description": "Discount codes that could not be applied, with reasons."
        }
      },
      "example": {
        "codes": [
          "SAVE20"
        ],
        "applied": [],
        "rejected": []
      }
    },
    "RejectedDiscount": {
      "type": "object",
      "additionalProperties": false,
      "description": "A discount code that could not be applied, with the reason.",
      "required": [
        "code",
        "reason"
      ],
      "properties": {
        "code": {
          "type": "string",
          "description": "The discount code that was rejected."
        },
        "reason": {
          "$ref": "#/$defs/DiscountErrorCode",
          "description": "Error code indicating why the discount was rejected."
        },
        "message": {
          "type": "string",
          "description": "Human-readable explanation of why the code was rejected."
        }
      },
      "example": {
        "code": "EXPIRED10",
        "reason": "discount_code_expired"
      }
    },
    "DiscountErrorCode": {
      "type": "string",
      "enum": [
        "discount_code_expired",
        "discount_code_invalid",
        "discount_code_already_applied",
        "discount_code_combination_disallowed",
        "discount_code_minimum_not_met",
        "discount_code_user_not_logged_in",
        "discount_code_user_ineligible",
        "discount_code_usage_limit_reached"
      ],
      "description": "Error codes for rejected discount codes, used in messages[].code.",
      "example": "discount_code_expired"
    },
    "PaymentResponse": {
      "description": "Payment configuration returned by the seller including accepted methods and handlers",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "provider": {
          "type": "string",
          "description": "Payment provider identifier"
        },
        "instruments": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": true,
            "description": "Payment instrument schema reference"
          },
          "description": "Available payment instruments"
        },
        "handlers": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": true,
            "description": "Payment handler configuration"
          },
          "description": "Available payment handlers"
        }
      },
      "example": {
        "instruments": [],
        "handlers": []
      }
    },
    "RiskSignals": {
      "description": "Risk and fraud detection signals for the checkout session",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "ip_address": {
          "type": "string",
          "description": "IP address of the buyer"
        },
        "user_agent": {
          "type": "string",
          "description": "User agent string of the buyer's browser"
        },
        "accept_language": {
          "type": "string",
          "description": "Accept-Language header from the buyer's browser"
        },
        "session_id": {
          "type": "string",
          "description": "Session identifier for the buyer"
        },
        "device_fingerprint": {
          "type": "string",
          "description": "Device fingerprint for fraud detection"
        }
      },
      "example": {
        "ip_country": "US",
        "device_fingerprint": "fp_abc123"
      }
    },
    "Order": {
      "type": "object",
      "additionalProperties": false,
      "description": "Order returned after checkout completion. Contains order details and optional rich post-purchase tracking.",
      "properties": {
        "type": {
          "type": "string",
          "const": "order",
          "description": "Discriminator field for webhook payloads. Always 'order' when present."
        },
        "id": {
          "type": "string",
          "description": "Unique identifier for the order"
        },
        "checkout_session_id": {
          "type": "string",
          "description": "ID of the checkout session that created this order"
        },
        "order_number": {
          "type": "string",
          "description": "Human-readable order number for customer reference"
        },
        "client_reference_id": {
          "type": "string",
          "description": "Reference from the client (agent/platform) stored on the order for reconciliation (e.g. platform transaction id, PO number, ERP id)."
        },
        "permalink_url": {
          "type": "string",
          "format": "uri",
          "description": "Permanent URL where the customer can view order details"
        },
        "status": {
          "type": "string",
          "description": "Order-level status. Implementations MUST accept unrecognized values gracefully. Defined values: 'created', 'confirmed', 'manual_review', 'processing', 'shipped', 'completed', 'canceled'. 'completed' means all items have been delivered/received regardless of fulfillment method. Distinct from LineItem.status 'fulfilled', which indicates the seller has dispatched the item."
        },
        "estimated_delivery": {
          "$ref": "#/$defs/EstimatedDelivery",
          "description": "Estimated delivery time range"
        },
        "confirmation": {
          "$ref": "#/$defs/OrderConfirmation",
          "description": "Order confirmation details"
        },
        "support": {
          "$ref": "#/$defs/SupportInfo",
          "description": "Customer support contact information"
        },
        "line_items": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/OrderLineItem"
          },
          "description": "What was ordered, with per-item fulfillment tracking"
        },
        "fulfillments": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/Fulfillment"
          },
          "description": "How items are being delivered (shipping, pickup, digital)"
        },
        "adjustments": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/Adjustment"
          },
          "description": "Post-order changes: refunds, credits, returns, disputes"
        },
        "totals": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/Total"
          },
          "description": "Order-level totals using the same Total schema as checkout. The 'total' entry is always the original charged amount. 'amount_refunded' tracks cumulative refunds."
        }
      },
      "required": [
        "id",
        "checkout_session_id",
        "permalink_url"
      ],
      "example": {
        "id": "ord_abc123",
        "order_number": "12345",
        "status": "confirmed",
        "currency": "usd",
        "total": 6764,
        "line_items": [],
        "created_at": "2026-02-13T10:30:00Z"
      }
    },
    "OrderLineItem": {
      "type": "object",
      "additionalProperties": false,
      "description": "Per-line-item tracking of what was ordered and fulfillment progress.",
      "properties": {
        "id": {
          "type": "string",
          "description": "Line item identifier, used for references in fulfillments and adjustments"
        },
        "title": {
          "type": "string",
          "description": "Product name"
        },
        "product_id": {
          "type": "string",
          "description": "Catalog product ID"
        },
        "description": {
          "type": "string",
          "description": "Product description"
        },
        "image_url": {
          "type": "string",
          "format": "uri",
          "description": "Product image URL"
        },
        "url": {
          "type": "string",
          "format": "uri",
          "description": "Product page URL"
        },
        "quantity": {
          "$ref": "#/$defs/OrderLineItemQuantity"
        },
        "unit_price": {
          "type": "integer",
          "description": "Price per unit in minor currency units (cents)"
        },
        "subtotal": {
          "type": "integer",
          "description": "Line total in minor currency units"
        },
        "totals": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/Total"
          },
          "description": "Optional line-item level totals breakdown using the same Total schema as checkout. Merchants who can provide richer breakdowns MAY use this alongside or instead of unit_price/subtotal."
        },
        "status": {
          "type": "string",
          "description": "Derived from quantity fields. Implementations MUST accept unrecognized values gracefully. Defined values: 'processing', 'partial', 'fulfilled', 'removed'. Rules: 'removed' if current==0, 'fulfilled' if fulfilled==current, 'partial' if 0<fulfilled<current, 'processing' otherwise."
        }
      },
      "required": [
        "id",
        "title",
        "quantity"
      ],
      "example": {
        "id": "oli_001",
        "title": "Running Shoes",
        "status": "fulfilled",
        "quantity": {
          "ordered": 2,
          "current": 2,
          "fulfilled": 2
        }
      }
    },
    "OrderLineItemQuantity": {
      "type": "object",
      "additionalProperties": false,
      "description": "Quantity tracking for an order line item. Uses a 3-field model: ordered (original), current (active after cancellations/returns), fulfilled (completed).",
      "properties": {
        "ordered": {
          "type": "integer",
          "minimum": 1,
          "description": "Quantity originally ordered by the customer"
        },
        "current": {
          "type": "integer",
          "minimum": 0,
          "description": "Current active quantity on the order. May be less than ordered due to cancellations or returns. A value of 0 means the line item has been fully removed."
        },
        "fulfilled": {
          "type": "integer",
          "minimum": 0,
          "default": 0,
          "description": "Quantity that has been fulfilled (shipped, picked up, or digitally delivered). Applies to all fulfillment types, not just shipping."
        }
      },
      "required": [
        "ordered",
        "current"
      ],
      "example": {
        "ordered": 3,
        "current": 3,
        "fulfilled": 2
      }
    },
    "LineItemReference": {
      "type": "object",
      "additionalProperties": false,
      "description": "Reference to a line item with quantity, used in fulfillments and adjustments",
      "properties": {
        "id": {
          "type": "string",
          "description": "Line item ID reference"
        },
        "quantity": {
          "type": "integer",
          "minimum": 1,
          "description": "Quantity in this fulfillment or adjustment"
        }
      },
      "required": [
        "id",
        "quantity"
      ],
      "example": {
        "line_item_id": "item_001",
        "quantity": 1
      }
    },
    "Fulfillment": {
      "type": "object",
      "additionalProperties": false,
      "description": "A fulfillment represents how items are delivered to the buyer (shipping, pickup, digital).",
      "properties": {
        "id": {
          "type": "string",
          "description": "Fulfillment identifier"
        },
        "type": {
          "type": "string",
          "enum": [
            "shipping",
            "pickup",
            "digital"
          ],
          "description": "Fulfillment method type"
        },
        "status": {
          "type": "string",
          "description": "Current fulfillment status. Implementations MUST accept unrecognized values gracefully. Defined values: 'pending', 'processing', 'shipped', 'in_transit', 'out_for_delivery', 'ready_for_pickup', 'delivered', 'failed', 'canceled'. Not all statuses apply to all types."
        },
        "line_items": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/LineItemReference"
          },
          "description": "Which line items and quantities are in this fulfillment"
        },
        "carrier": {
          "type": "string",
          "description": "Carrier name (e.g., 'FedEx', 'UPS', 'USPS'). Applies to type: shipping."
        },
        "tracking_number": {
          "type": "string",
          "description": "Carrier tracking number. Applies to type: shipping."
        },
        "tracking_url": {
          "type": "string",
          "format": "uri",
          "description": "URL to track this shipment. Applies to type: shipping."
        },
        "destination": {
          "$ref": "#/$defs/Address"
        },
        "estimated_delivery": {
          "$ref": "#/$defs/EstimatedDelivery"
        },
        "digital_delivery": {
          "type": "object",
          "description": "Digital delivery details. Applies to type: digital.",
          "properties": {
            "access_url": {
              "type": "string",
              "format": "uri",
              "description": "URL to access digital content (download link, streaming page, etc.)"
            },
            "license_key": {
              "type": "string",
              "description": "License or activation key"
            },
            "expires_at": {
              "type": "string",
              "format": "date-time",
              "description": "When access expires (RFC 3339 timestamp)"
            }
          }
        },
        "description": {
          "type": "string",
          "description": "Human-readable description (e.g., 'Backordered - ships Feb 15')"
        },
        "events": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/FulfillmentEvent"
          },
          "description": "Append-only event log tracking fulfillment progress"
        }
      },
      "required": [
        "id",
        "type"
      ],
      "example": {
        "id": "ful_001",
        "type": "shipping",
        "status": "shipped",
        "line_items": [],
        "tracking_number": "1Z999AA10123456784",
        "carrier": "UPS"
      }
    },
    "FulfillmentEvent": {
      "type": "object",
      "additionalProperties": false,
      "description": "A point-in-time event in the fulfillment lifecycle.",
      "properties": {
        "id": {
          "type": "string",
          "description": "Event identifier"
        },
        "type": {
          "type": "string",
          "description": "Event type. Implementations MUST accept unrecognized values gracefully. Defined values: 'processing', 'shipped', 'in_transit', 'out_for_delivery', 'ready_for_pickup', 'delivered', 'failed_attempt', 'returned_to_sender', 'canceled', 'undeliverable'. 'out_for_delivery' and 'ready_for_pickup' are ACP extensions for richer agent experiences."
        },
        "occurred_at": {
          "type": "string",
          "format": "date-time",
          "description": "RFC 3339 timestamp when this event occurred"
        },
        "description": {
          "type": "string",
          "description": "Human-readable description (e.g., 'Left at front door')"
        },
        "location": {
          "type": "string",
          "description": "Location where this event occurred (e.g., 'Memphis, TN')"
        }
      },
      "required": [
        "id",
        "type",
        "occurred_at"
      ],
      "example": {
        "status": "shipped",
        "timestamp": "2026-02-13T14:00:00Z",
        "location": "San Francisco, CA"
      }
    },
    "Adjustment": {
      "type": "object",
      "additionalProperties": false,
      "description": "A post-order change such as refund, credit, return, or dispute.",
      "properties": {
        "id": {
          "type": "string",
          "description": "Adjustment identifier"
        },
        "type": {
          "type": "string",
          "description": "Type of adjustment. Implementations MUST accept unrecognized values gracefully. Defined values: 'refund', 'credit', 'return', 'exchange', 'price_adjustment', 'cancellation', 'dispute'. Use 'refund' for both full and partial refunds (distinguish by amount). 'credit' replaces 'store_credit'. 'dispute' covers chargebacks."
        },
        "occurred_at": {
          "type": "string",
          "format": "date-time",
          "description": "RFC 3339 timestamp when this adjustment occurred"
        },
        "status": {
          "type": "string",
          "description": "Adjustment status. Implementations MUST accept unrecognized values gracefully. Defined values: 'pending', 'completed', 'failed'."
        },
        "line_items": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/LineItemReference"
          },
          "description": "Which line items and quantities are affected"
        },
        "amount": {
          "type": "integer",
          "description": "Total amount credited to the buyer in minor currency units, inclusive of any applicable tax"
        },
        "currency": {
          "type": "string",
          "pattern": "^[a-z]{3}$",
          "description": "ISO 4217 currency code"
        },
        "description": {
          "type": "string",
          "description": "Human-readable reason (e.g., 'Defective item')"
        },
        "reason": {
          "type": "string",
          "description": "Structured reason code"
        }
      },
      "required": [
        "id",
        "type",
        "occurred_at",
        "status"
      ],
      "example": {
        "id": "adj_001",
        "type": "refund",
        "amount": 1000,
        "currency": "usd",
        "reason": "Customer request",
        "created_at": "2026-02-14T10:00:00Z"
      }
    },
    "AuthenticationMetadata": {
      "type": "object",
      "additionalProperties": true,
      "description": "Seller-provided authentication metadata for 3DS flows.",
      "required": [
        "acquirer_details",
        "directory_server"
      ],
      "properties": {
        "acquirer_details": {
          "type": "object",
          "additionalProperties": false,
          "description": "Details about the acquirer used for this 3DS Authentication. This object MUST be present.",
          "properties": {
            "acquirer_bin": {
              "type": "string",
              "maxLength": 11,
              "description": "The Acquirer BIN (directory-server specific)."
            },
            "acquirer_country": {
              "type": "string",
              "minLength": 2,
              "maxLength": 2,
              "description": "Two-letter ISO 3166-1 alpha-2 country code."
            },
            "acquirer_merchant_id": {
              "type": "string",
              "maxLength": 35,
              "description": "The Merchant ID assigned by the acquirer."
            },
            "merchant_name": {
              "type": "string",
              "maxLength": 40,
              "description": "Merchant name assigned by the acquirer."
            },
            "requestor_id": {
              "type": "string",
              "maxLength": 35,
              "description": "Requestor ID (if required by the directory server)."
            }
          },
          "required": [
            "acquirer_bin",
            "acquirer_country",
            "acquirer_merchant_id",
            "merchant_name"
          ]
        },
        "directory_server": {
          "type": "string",
          "enum": [
            "american_express",
            "mastercard",
            "visa"
          ],
          "description": "The 3DS directory server used for this Authentication."
        },
        "flow_preference": {
          "type": "object",
          "additionalProperties": false,
          "description": "Contains additional details on the seller's preference for the 3DS authentication flow. Sellers MAY request a preference, but issuers ultimately decide the actual flow.",
          "properties": {
            "type": {
              "type": "string",
              "enum": [
                "challenge",
                "frictionless"
              ],
              "description": "Type of flow requested for this 3DS Authentication. 'challenge' requests a challenge flow; 'frictionless' requests a frictionless flow."
            },
            "challenge": {
              "type": "object",
              "additionalProperties": false,
              "description": "Details about the requested challenge flow.",
              "properties": {
                "type": {
                  "type": "string",
                  "enum": [
                    "mandated",
                    "preferred"
                  ],
                  "description": "Subtype of challenge preference."
                }
              }
            },
            "frictionless": {
              "type": "object",
              "additionalProperties": false,
              "description": "Details about the requested frictionless flow.",
              "properties": {
                "type": {
                  "type": "string",
                  "enum": [
                    "low_risk"
                  ],
                  "description": "Subtype of frictionless preference."
                }
              }
            }
          },
          "required": [
            "type"
          ]
        }
      },
      "example": {
        "three_ds_version": "2.1.0",
        "merchant_name": "Example Store"
      }
    },
    "AuthenticationResult": {
      "type": "object",
      "additionalProperties": false,
      "description": "Agent-provided authentication results returned to the seller for card-based 3D Secure.",
      "properties": {
        "outcome": {
          "type": "string",
          "description": "The outcome of this 3DS Authentication.",
          "enum": [
            "abandoned",
            "attempt_acknowledged",
            "authenticated",
            "canceled",
            "denied",
            "informational",
            "internal_error",
            "not_supported",
            "processing_error",
            "rejected"
          ],
          "example": "authenticated"
        },
        "outcome_details": {
          "type": "object",
          "description": "Detailed authentication data. This field is required when the outcome is 'authenticated', 'informational', or 'attempt_acknowledged'.",
          "additionalProperties": false,
          "properties": {
            "three_ds_cryptogram": {
              "type": "string",
              "description": "The 3DS cryptogram (authentication value / AAV/CAVV/AEVV). This value is 20 bytes, base64-encoded into a 28-character string.",
              "example": "AbCdEfGhIjKlMnOpQrStUvWxY0="
            },
            "electronic_commerce_indicator": {
              "type": "string",
              "description": "Electronic Commerce Indicator (ECI) returned by the 3D Secure provider. Indicates the degree/type of authentication performed.",
              "enum": [
                "01",
                "02",
                "05",
                "06",
                "07"
              ],
              "example": "05"
            },
            "transaction_id": {
              "type": "string",
              "description": "Transaction identifier returned by the 3DS system:\n- For 3DS1: the XID\n- For 3DS2: the Directory Server Transaction ID (dsTransID)",
              "example": "dsTransId_abc123"
            },
            "version": {
              "type": "string",
              "description": "The 3D Secure version used for this authentication (for example '1.0.2' or '2.2.0').",
              "example": "2.2.0"
            }
          },
          "required": [
            "three_ds_cryptogram",
            "electronic_commerce_indicator",
            "transaction_id",
            "version"
          ]
        }
      },
      "required": [
        "outcome"
      ],
      "allOf": [
        {
          "if": {
            "properties": {
              "outcome": {
                "enum": [
                  "authenticated",
                  "informational",
                  "attempt_acknowledged"
                ]
              }
            }
          },
          "then": {
            "required": [
              "outcome_details"
            ]
          }
        }
      ],
      "example": {
        "status": "authenticated",
        "transaction_id": "3ds_abc123",
        "eci": "05"
      }
    },
    "MarketingConsentOption": {
      "description": "Seller-declared marketing consent option that specifies an available channel for which the seller must obtain the buyer's consent before sending marketing content",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "channel": {
          "type": "string",
          "description": "Channel for marketing consent.",
          "examples": [
            "email",
            "sms",
            "whatsapp"
          ]
        },
        "display_text": {
          "type": "string",
          "description": "What the buyer is consenting to receive, e.g., 'promotional emails, product launches, and exclusive offers'. Agents MAY use this to compose their own consent prompt."
        },
        "privacy_policy_url": {
          "type": "string",
          "format": "uri",
          "description": "URL to the seller's privacy policy governing use of the buyer's contact information for marketing."
        },
        "is_subscribed": {
          "type": "boolean",
          "description": "Whether the buyer is currently subscribed to marketing via this channel. When true, agents SHOULD render the consent checkbox as pre-checked. Defaults to false if omitted."
        }
      },
      "required": [
        "channel",
        "display_text",
        "privacy_policy_url"
      ],
      "example": {
        "channel": "email",
        "display_text": "Promotional emails, product launches, and exclusive offers",
        "privacy_policy_url": "https://www.example.com/privacy",
        "is_subscribed": false
      }
    },
    "MarketingConsent": {
      "description": "Buyer's marketing consent decision for a specific channel submitted at checkout completion",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "channel": {
          "type": "string",
          "description": "Channel matching the consent option channel.",
          "examples": [
            "email",
            "sms",
            "whatsapp"
          ]
        },
        "opted_in": {
          "type": "boolean",
          "description": "Whether the buyer consented to receive marketing via this channel."
        }
      },
      "required": [
        "channel",
        "opted_in"
      ],
      "example": {
        "channel": "email",
        "opted_in": true
      }
    },
    "CheckoutSessionBase": {
      "description": "Base checkout session model containing common fields for all checkout session states",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "description": "Unique identifier for the checkout session"
        },
        "protocol": {
          "$ref": "#/$defs/ProtocolVersion",
          "description": "Protocol version metadata"
        },
        "capabilities": {
          "$ref": "#/$defs/Capabilities",
          "description": "Negotiated capabilities between agent and seller"
        },
        "buyer": {
          "$ref": "#/$defs/Buyer",
          "description": "Buyer information"
        },
        "status": {
          "type": "string",
          "enum": [
            "incomplete",
            "not_ready_for_payment",
            "requires_escalation",
            "authentication_required",
            "ready_for_payment",
            "pending_approval",
            "complete_in_progress",
            "completed",
            "canceled",
            "in_progress",
            "expired"
          ],
          "description": "Current status of the checkout session"
        },
        "currency": {
          "type": "string",
          "description": "ISO 4217 settlement currency code"
        },
        "presentment_currency": {
          "type": "string",
          "description": "ISO 4217 presentment currency code if different from settlement currency"
        },
        "exchange_rate": {
          "type": "number",
          "description": "Exchange rate from presentment to settlement currency"
        },
        "exchange_rate_timestamp": {
          "type": "string",
          "format": "date-time",
          "description": "RFC 3339 timestamp when exchange rate was determined"
        },
        "locale": {
          "type": "string",
          "description": "Locale code (e.g., 'en-US') for localizing content"
        },
        "timezone": {
          "type": "string",
          "description": "IANA timezone identifier (e.g., 'America/New_York')"
        },
        "line_items": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/LineItem"
          },
          "description": "Line items in the checkout session"
        },
        "fulfillment_details": {
          "$ref": "#/$defs/FulfillmentDetails",
          "description": "Fulfillment contact and address details"
        },
        "fulfillment_options": {
          "type": "array",
          "items": {
            "oneOf": [
              {
                "$ref": "#/$defs/FulfillmentOptionShipping"
              },
              {
                "$ref": "#/$defs/FulfillmentOptionDigital"
              },
              {
                "$ref": "#/$defs/FulfillmentOptionPickup"
              },
              {
                "$ref": "#/$defs/FulfillmentOptionLocalDelivery"
              }
            ]
          },
          "description": "Available fulfillment options"
        },
        "selected_fulfillment_options": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/SelectedFulfillmentOption"
          },
          "description": "Currently selected fulfillment options"
        },
        "fulfillment_groups": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/FulfillmentGroup"
          },
          "description": "Optional grouping of line items by fulfillment method"
        },
        "totals": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/Total"
          },
          "description": "Cart-level totals breakdown"
        },
        "messages": {
          "type": "array",
          "items": {
            "oneOf": [
              {
                "$ref": "#/$defs/MessageInfo"
              },
              {
                "$ref": "#/$defs/MessageWarning"
              },
              {
                "$ref": "#/$defs/MessageError"
              }
            ]
          },
          "description": "Messages to communicate with the buyer (info, warnings, errors)"
        },
        "links": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/Link"
          },
          "description": "Relevant links (terms, policies, support)"
        },
        "authentication_metadata": {
          "$ref": "#/$defs/AuthenticationMetadata",
          "description": "Authentication metadata for payment interventions (e.g., 3DS)"
        },
        "created_at": {
          "type": "string",
          "format": "date-time",
          "description": "RFC 3339 timestamp when the session was created"
        },
        "updated_at": {
          "type": "string",
          "format": "date-time",
          "description": "RFC 3339 timestamp of last update"
        },
        "expires_at": {
          "type": "string",
          "format": "date-time",
          "description": "RFC 3339 timestamp when the session expires"
        },
        "continue_url": {
          "type": "string",
          "format": "uri",
          "description": "URL to continue or resume the checkout session"
        },
        "metadata": {
          "type": "object",
          "additionalProperties": true,
          "description": "Arbitrary metadata for merchant use"
        },
        "quote_id": {
          "type": "string",
          "description": "Quote identifier if this session is based on a quote"
        },
        "quote_expires_at": {
          "type": "string",
          "format": "date-time",
          "description": "RFC 3339 timestamp when the quote expires"
        },
        "discounts": {
          "$ref": "#/$defs/DiscountsResponse",
          "description": "Discount extension: submitted codes and applied discounts. Present when the 'discount' extension is active."
        },
        "marketing_consent_options": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/MarketingConsentOption"
          },
          "description": "Marketing consent options the seller offers. When present, the agent SHOULD display these to the buyer before checkout completion. Agents MAY selectively surface a subset of options; options not surfaced MUST be omitted from marketing_consents in the complete request. When absent, the agent MUST NOT surface any marketing consent UI. An empty array is equivalent to absent."
        },
        "order": {
          "$ref": "#/$defs/Order"
        }
      },
      "required": [
        "id",
        "status",
        "currency",
        "line_items",
        "totals",
        "fulfillment_options",
        "messages",
        "links",
        "capabilities"
      ],
      "example": {
        "id": "cs_abc123",
        "status": "ready_for_payment",
        "currency": "usd",
        "line_items": [],
        "totals": {
          "currency": "usd",
          "subtotal": 5800,
          "total": 6764
        },
        "fulfillment_options": [],
        "messages": [],
        "links": [],
        "capabilities": {}
      }
    },
    "CheckoutSession": {
      "description": "Checkout session response model",
      "allOf": [
        {
          "$ref": "#/$defs/CheckoutSessionBase"
        }
      ],
      "example": {
        "id": "cs_abc123",
        "status": "ready_for_payment",
        "currency": "usd",
        "line_items": [],
        "totals": {
          "currency": "usd",
          "subtotal": 5800,
          "total": 6764
        },
        "fulfillment_options": [],
        "messages": [],
        "links": [],
        "capabilities": {}
      }
    },
    "CheckoutSessionWithOrder": {
      "description": "Checkout session response after completion, includes the created order",
      "allOf": [
        {
          "$ref": "#/$defs/CheckoutSessionBase"
        },
        {
          "description": "Order extension for completed checkout sessions",
          "type": "object",
          "properties": {
            "order": {
              "$ref": "#/$defs/Order",
              "description": "Order created when checkout is completed"
            }
          },
          "required": [
            "order"
          ]
        }
      ],
      "example": {
        "id": "cs_abc123",
        "status": "completed",
        "currency": "usd",
        "line_items": [],
        "totals": {
          "currency": "usd",
          "subtotal": 5800,
          "total": 6764
        },
        "fulfillment_options": [],
        "messages": [],
        "links": [],
        "capabilities": {},
        "order": {
          "id": "ord_abc123",
          "order_number": "12345",
          "status": "confirmed",
          "currency": "usd",
          "total": 6764,
          "line_items": [],
          "created_at": "2026-02-13T10:30:00Z"
        }
      }
    },
    "CheckoutSessionCreateRequest": {
      "description": "Request to create a new checkout session",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "buyer": {
          "$ref": "#/$defs/Buyer",
          "description": "Buyer information"
        },
        "line_items": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/Item"
          },
          "minItems": 1,
          "description": "Items to add to the checkout session"
        },
        "currency": {
          "type": "string",
          "description": "ISO 4217 currency code"
        },
        "fulfillment_details": {
          "$ref": "#/$defs/FulfillmentDetails",
          "description": "Fulfillment contact and address details"
        },
        "capabilities": {
          "$ref": "#/$defs/Capabilities",
          "description": "Agent capabilities and supported features"
        },
        "fulfillment_groups": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/FulfillmentGroup"
          },
          "description": "Grouping of items by fulfillment method"
        },
        "affiliate_attribution": {
          "$ref": "#/$defs/AffiliateAttribution",
          "description": "Affiliate attribution data for first-touch tracking"
        },
        "coupons": {
          "type": "array",
          "items": {
            "type": "string",
            "description": "Coupon code to apply"
          },
          "description": "DEPRECATED: Use discounts.codes instead. Discount codes to apply."
        },
        "discounts": {
          "$ref": "#/$defs/DiscountsRequest",
          "description": "Discount codes to apply to the checkout session."
        },
        "locale": {
          "type": "string",
          "description": "Locale code for localizing content (e.g., 'en-US')"
        },
        "timezone": {
          "type": "string",
          "description": "IANA timezone identifier (e.g., 'America/New_York')"
        },
        "quote_id": {
          "type": "string",
          "description": "Quote identifier if this session is based on a quote"
        },
        "metadata": {
          "type": "object",
          "additionalProperties": true,
          "description": "Arbitrary metadata for merchant use"
        },
        "order_notes": {
          "type": "string",
          "maxLength": 5000,
          "description": "Optional customer/order notes (e.g., delivery instructions, gift message)."
        }
      },
      "required": [
        "line_items",
        "currency",
        "capabilities"
      ],
      "example": {
        "items": [
          {
            "product_id": "prod_tshirt_blue_m",
            "quantity": 2
          }
        ],
        "currency": "usd",
        "capabilities": {}
      }
    },
    "CheckoutSessionUpdateRequest": {
      "description": "Request to update an existing checkout session",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "buyer": {
          "$ref": "#/$defs/Buyer",
          "description": "Updated buyer information"
        },
        "line_items": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/Item"
          },
          "description": "Items to update in the checkout session"
        },
        "fulfillment_details": {
          "$ref": "#/$defs/FulfillmentDetails",
          "description": "Updated fulfillment contact and address"
        },
        "fulfillment_groups": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/FulfillmentGroup"
          },
          "description": "Updated fulfillment groupings"
        },
        "selected_fulfillment_options": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/SelectedFulfillmentOption"
          },
          "description": "Fulfillment option selected by the buyer"
        },
        "coupons": {
          "type": "array",
          "items": {
            "type": "string",
            "description": "Coupon code to apply"
          },
          "description": "DEPRECATED: Use discounts.codes instead. Discount codes to apply."
        },
        "discounts": {
          "$ref": "#/$defs/DiscountsRequest",
          "description": "Discount codes to apply. Replaces previously submitted codes."
        },
        "order_notes": {
          "type": "string",
          "maxLength": 5000,
          "description": "Optional customer/order notes."
        }
      },
      "example": {
        "buyer": {
          "email": "customer@example.com"
        }
      }
    },
    "CheckoutSessionCompleteRequest": {
      "description": "Request to complete a checkout session and create an order",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "buyer": {
          "$ref": "#/$defs/Buyer",
          "description": "Final buyer information"
        },
        "payment_data": {
          "$ref": "#/$defs/PaymentData",
          "description": "Payment method and details"
        },
        "authentication_result": {
          "$ref": "#/$defs/AuthenticationResult",
          "description": "Authentication result for 3DS flows"
        },
        "affiliate_attribution": {
          "$ref": "#/$defs/AffiliateAttribution",
          "description": "Affiliate attribution data for last-touch tracking"
        },
        "risk_signals": {
          "$ref": "#/$defs/RiskSignals",
          "description": "Risk and fraud signals"
        },
        "marketing_consents": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/MarketingConsent"
          },
          "description": "Buyer's marketing consent decisions. Agents SHOULD include an entry for each consent option surfaced to the buyer. Options not surfaced MUST be omitted — omission preserves existing subscription state. Sellers SHOULD ignore entries in marketing_consents that do not correspond to a channel in marketing_consent_options."
        },
        "order_notes": {
          "type": "string",
          "maxLength": 5000,
          "description": "Optional customer/order notes (delivery instructions, gift message)."
        }
      },
      "required": [
        "payment_data"
      ],
      "example": {
        "payment_data": {
          "type": "vault_token",
          "token": "vt_01J8Z3WXYZ9ABC123"
        }
      }
    },
    "IntentTrace": {
      "description": "Structured reason for why a buyer action was taken, used for analytics and debugging",
      "type": "object",
      "properties": {
        "reason_code": {
          "type": "string",
          "description": "Reason for abandonment. This enum is extensible: servers SHOULD accept unrecognized values and treat them as 'other' (see RFC Section 7.2). Validators SHOULD be configured for lenient enum handling.",
          "enum": [
            "price_sensitivity",
            "shipping_cost",
            "shipping_speed",
            "product_fit",
            "trust_security",
            "returns_policy",
            "payment_options",
            "comparison",
            "timing_deferred",
            "other"
          ]
        },
        "trace_summary": {
          "type": "string",
          "maxLength": 500,
          "description": "A generated summary of the specific objection or negotiation gap."
        },
        "metadata": {
          "type": "object",
          "additionalProperties": {
            "type": [
              "string",
              "number",
              "boolean"
            ],
            "description": "Metadata value"
          },
          "description": "Additional structured metadata about the intent"
        }
      },
      "required": [
        "reason_code"
      ],
      "example": {
        "reason_code": "buyer_initiated",
        "description": "Customer requested to complete checkout",
        "metadata": {}
      }
    },
    "CancelSessionRequest": {
      "description": "Request to cancel a checkout session",
      "type": "object",
      "properties": {
        "intent_trace": {
          "$ref": "#/$defs/IntentTrace"
        }
      },
      "example": {
        "intent_trace": {
          "reason_code": "buyer_cancelled",
          "description": "Customer decided not to purchase"
        }
      }
    },
    "DiscoveryResponse": {
      "type": "object",
      "additionalProperties": false,
      "description": "Well-known discovery document served at /.well-known/acp.json. Describes the seller's capabilities. This is stable, deterministic information that does not vary per session. Session-specific capabilities (payment methods, payment handlers) are negotiated inline via the capabilities object on POST /checkout_sessions.",
      "properties": {
        "protocol": {
          "$ref": "#/$defs/DiscoveryProtocol"
        },
        "api_base_url": {
          "type": "string",
          "format": "uri",
          "description": "Base URL for the ACP REST API. Agents append resource paths to this URL (e.g., {api_base_url}/checkout_sessions)."
        },
        "transports": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "rest",
              "mcp"
            ]
          },
          "uniqueItems": true,
          "description": "Transport bindings supported by this seller. \"rest\" indicates the REST API at api_base_url. \"mcp\" indicates a Model Context Protocol server is available (see SEP #135). New values are introduced in new API versions; agents MAY treat this enum as exhaustive for a given version."
        },
        "capabilities": {
          "$ref": "#/$defs/DiscoveryCapabilities"
        }
      },
      "required": [
        "protocol",
        "api_base_url",
        "transports",
        "capabilities"
      ],
      "example": {
        "protocol": {
          "name": "acp",
          "version": "2026-04-17",
          "supported_versions": [
            "2025-09-29",
            "2026-01-30",
            "2026-04-17"
          ]
        },
        "api_base_url": "https://acp.stripe.com/api",
        "transports": [
          "rest"
        ],
        "capabilities": {
          "services": [
            "checkout"
          ]
        }
      }
    },
    "DiscoveryCapabilities": {
      "type": "object",
      "additionalProperties": false,
      "description": "Seller capabilities advertised in the well-known discovery document. Contains feature declarations that are stable across sessions.",
      "properties": {
        "services": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "checkout",
              "orders",
              "delegate_payment",
              "carts"
            ]
          },
          "uniqueItems": true,
          "description": "Services available from this seller. Indicates which ACP operations are implemented. This enum is closed per API version; new values are introduced in new API versions. Agents MAY treat the set as exhaustive for a given version."
        },
        "extensions": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/DiscoveryExtension"
          },
          "description": "Extensions the seller supports. Whether a specific extension is active for a given session is determined during checkout session creation."
        },
        "intervention_types": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "3ds",
              "biometric",
              "address_verification"
            ]
          },
          "uniqueItems": true,
          "description": "Intervention types the seller supports. Actual availability for a specific session is negotiated via the capabilities object on POST /checkout_sessions. This enum is closed per API version; new values are introduced in new API versions. Agents MAY treat the set as exhaustive for a given version."
        },
        "supported_currencies": {
          "type": "array",
          "items": {
            "type": "string",
            "pattern": "^[a-z]{3}$",
            "description": "ISO 4217 currency code in lowercase (e.g., \"usd\", \"eur\")"
          },
          "uniqueItems": true,
          "description": "ISO 4217 currency codes supported by the seller."
        },
        "supported_locales": {
          "type": "array",
          "items": {
            "type": "string",
            "description": "BCP 47 locale tag (e.g., \"en-US\", \"fr-FR\")"
          },
          "uniqueItems": true,
          "description": "BCP 47 locale tags supported by the seller for localized responses."
        }
      },
      "required": [
        "services"
      ],
      "example": {
        "services": [
          "checkout",
          "orders",
          "delegate_payment",
          "carts"
        ],
        "extensions": [
          {
            "name": "discount",
            "spec": "https://agenticcommerce.dev/specs/discount",
            "schema": "https://agenticcommerce.dev/schemas/discount.json"
          }
        ],
        "intervention_types": [
          "3ds"
        ],
        "supported_currencies": [
          "usd",
          "eur"
        ],
        "supported_locales": [
          "en-US"
        ]
      }
    },
    "DiscoveryProtocol": {
      "type": "object",
      "additionalProperties": false,
      "description": "Protocol identification and version information.",
      "properties": {
        "name": {
          "type": "string",
          "const": "acp",
          "description": "Protocol identifier. Always \"acp\"."
        },
        "version": {
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
          "description": "The current (latest) API version supported by the seller, in YYYY-MM-DD format."
        },
        "supported_versions": {
          "type": "array",
          "items": {
            "type": "string",
            "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
            "description": "API version in YYYY-MM-DD format"
          },
          "uniqueItems": true,
          "description": "All API versions the seller currently supports, in chronological order (oldest first). Agents SHOULD use the API-Version header to request a specific version. The last element is always the latest supported version."
        },
        "documentation_url": {
          "type": "string",
          "format": "uri",
          "description": "URL to the seller's ACP documentation."
        }
      },
      "required": [
        "name",
        "version",
        "supported_versions"
      ],
      "example": {
        "name": "acp",
        "version": "2026-04-17",
        "supported_versions": [
          "2025-09-29",
          "2026-01-30",
          "2026-04-17"
        ],
        "documentation_url": "https://agenticcommerce.dev"
      }
    },
    "DiscoveryExtension": {
      "type": "object",
      "additionalProperties": false,
      "description": "High-level extension declaration in the discovery document. Identifies the extension and provides a spec URL, but does not include session-level details like schema or extends fields.",
      "properties": {
        "name": {
          "type": "string",
          "description": "Extension identifier (e.g., \"discount\", \"fulfillment\")."
        },
        "spec": {
          "type": "string",
          "format": "uri",
          "description": "URL to the extension's specification document."
        },
        "schema": {
          "type": "string",
          "format": "uri",
          "description": "URL to the extension's JSON Schema definition for programmatic validation."
        }
      },
      "required": [
        "name"
      ],
      "example": {
        "name": "discount",
        "spec": "https://agenticcommerce.dev/specs/discount",
        "schema": "https://agenticcommerce.dev/schemas/discount.json"
      }
    },
    "Error": {
      "type": "object",
      "additionalProperties": false,
      "description": "Protocol-level error returned in 4xx/5xx responses when the server cannot return a valid CheckoutSession at all (e.g. malformed request or unexpected failure). Use Error—not MessageError—when there is no valid session state to return. type semantics: invalid_request — malformed request, missing required fields, invalid JSON, or idempotency violations (codes: idempotency_key_required, idempotency_in_flight, idempotency_conflict); processing_error — unexpected server-side failure; service_unavailable — temporary unavailability.",
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "invalid_request",
            "processing_error",
            "service_unavailable"
          ],
          "description": "Error type indicating the category of protocol-level error"
        },
        "code": {
          "type": "string",
          "description": "Implementation-defined error code"
        },
        "message": {
          "type": "string",
          "description": "Human-readable error message"
        },
        "param": {
          "type": "string",
          "description": "RFC 9535 JSONPath (optional)"
        },
        "supported_versions": {
          "type": "array",
          "items": {
            "type": "string",
            "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
            "description": "Supported API version in YYYY-MM-DD format"
          },
          "description": "List of API versions supported by the server, ordered by preference (newest first). Only included in version-related errors."
        }
      },
      "required": [
        "type",
        "code",
        "message"
      ],
      "example": {
        "type": "invalid_request",
        "code": "invalid_email",
        "message": "The email address format is invalid",
        "param": "$.buyer.email"
      }
    }
  }
},
  // schema.agentic_checkout.json SHA-256: d0e4290617d66bf05d002b8ace388732be2b3eb9a92a1003db7a2daa1e0436f2
  cart: {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.com/schemas/cart/bundle.schema.json",
  "title": "Cart — Schema Bundle",
  "$defs": {
    "Cart": {
      "description": "A shopping cart with estimated pricing. Carts provide a lightweight pre-checkout phase for item collection without payment configuration or status lifecycle.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "line_items",
        "currency",
        "totals"
      ],
      "properties": {
        "id": {
          "type": "string",
          "description": "Unique cart identifier, server-generated."
        },
        "line_items": {
          "type": "array",
          "items": {
            "$ref": "schema.agentic_checkout.json#/$defs/LineItem"
          },
          "description": "Cart line items. Same structure as checkout line items."
        },
        "buyer": {
          "$ref": "schema.agentic_checkout.json#/$defs/Buyer",
          "description": "Buyer information, if provided."
        },
        "currency": {
          "type": "string",
          "description": "ISO 4217 currency code. Determined by the seller based on context or request."
        },
        "totals": {
          "type": "array",
          "items": {
            "$ref": "schema.agentic_checkout.json#/$defs/Total"
          },
          "description": "Estimated cost breakdown. May be partial (e.g., tax omitted if address is unknown). Totals are estimates until checkout."
        },
        "messages": {
          "type": "array",
          "items": {
            "oneOf": [
              {
                "$ref": "schema.agentic_checkout.json#/$defs/MessageInfo"
              },
              {
                "$ref": "schema.agentic_checkout.json#/$defs/MessageWarning"
              },
              {
                "$ref": "schema.agentic_checkout.json#/$defs/MessageError"
              }
            ]
          },
          "description": "Validation messages, warnings, or informational notices (e.g., low stock, price changes)."
        },
        "continue_url": {
          "type": "string",
          "format": "uri",
          "description": "URL for cart handoff, sharing, or session recovery."
        },
        "expires_at": {
          "type": "string",
          "format": "date-time",
          "description": "RFC 3339 timestamp when the cart expires."
        }
      },
      "example": {
        "id": "cart_abc123",
        "line_items": [
          {
            "id": "li_1",
            "item": {
              "id": "item_123",
              "name": "Blue Running Shoes",
              "unit_amount": 12000
            },
            "quantity": 2,
            "totals": [
              {
                "type": "subtotal",
                "amount": 24000
              }
            ]
          }
        ],
        "currency": "usd",
        "totals": [
          {
            "type": "subtotal",
            "amount": 24000
          },
          {
            "type": "total",
            "amount": 24000
          }
        ],
        "continue_url": "https://seller.example.com/cart/cart_abc123",
        "expires_at": "2026-04-01T12:00:00Z"
      }
    },
    "CartCreateRequest": {
      "description": "Request to create a new cart.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "line_items"
      ],
      "properties": {
        "line_items": {
          "type": "array",
          "items": {
            "$ref": "schema.agentic_checkout.json#/$defs/Item"
          },
          "minItems": 1,
          "description": "Items to add to the cart."
        },
        "buyer": {
          "$ref": "schema.agentic_checkout.json#/$defs/Buyer",
          "description": "Buyer information for personalized estimates."
        },
        "locale": {
          "type": "string",
          "description": "Locale code for content localization (e.g., 'en-US')."
        }
      },
      "example": {
        "line_items": [
          {
            "id": "item_123",
            "quantity": 2
          },
          {
            "id": "item_456",
            "quantity": 1
          }
        ],
        "buyer": {
          "email": "buyer@example.com"
        }
      }
    },
    "CartUpdateRequest": {
      "description": "Request to update a cart. Full replacement — the agent MUST send the complete desired cart state.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "line_items"
      ],
      "properties": {
        "line_items": {
          "type": "array",
          "items": {
            "$ref": "schema.agentic_checkout.json#/$defs/Item"
          },
          "minItems": 1,
          "description": "Complete list of items (replaces existing cart contents)."
        },
        "buyer": {
          "$ref": "schema.agentic_checkout.json#/$defs/Buyer",
          "description": "Updated buyer information."
        }
      },
      "example": {
        "line_items": [
          {
            "id": "item_123",
            "quantity": 3
          },
          {
            "id": "item_789",
            "quantity": 1
          }
        ]
      }
    }
  }
},
  // schema.cart.json SHA-256: 4480260393132f24da09fb99554dd510822f22345755394c72c2444e24ddd0b3
  delegateAuthentication: {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.com/schemas/delegate-authentication/bundle.schema.json",
  "title": "Delegate Authentication - Schema Bundle",
  "$defs": {
    "Address": {
      "type": "object",
      "description": "The physical address details for the shopper.",
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string",
          "maxLength": 256,
          "description": "Full name of the recipient"
        },
        "line_one": {
          "type": "string",
          "maxLength": 60,
          "description": "First line of the address"
        },
        "line_two": {
          "type": "string",
          "maxLength": 60,
          "description": "Second line of the address"
        },
        "city": {
          "type": "string",
          "maxLength": 60,
          "description": "City name"
        },
        "state": {
          "type": "string",
          "description": "ISO-3166-2 where applicable"
        },
        "country": {
          "type": "string",
          "minLength": 2,
          "maxLength": 2,
          "description": "ISO-3166-1 alpha-2"
        },
        "postal_code": {
          "type": "string",
          "maxLength": 20,
          "description": "Postal or ZIP code"
        }
      },
      "required": [
        "name",
        "line_one",
        "city",
        "state",
        "country",
        "postal_code"
      ],
      "examples": [
        {
          "name": "Jane Doe",
          "line_one": "123 Main Street",
          "city": "Amsterdam",
          "state": "NH",
          "country": "NL",
          "postal_code": "1012 AB"
        }
      ]
    },
    "PaymentMethod": {
      "type": "object",
      "description": "Payment instrument details used for authentication.",
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "card"
          ],
          "description": "The payment method type"
        },
        "number": {
          "type": "string",
          "description": "Card number (PAN)"
        },
        "exp_month": {
          "type": "string",
          "maxLength": 2,
          "description": "Expiry month (01-12)"
        },
        "exp_year": {
          "type": "string",
          "maxLength": 4,
          "description": "Expiry year (4 digits)"
        },
        "name": {
          "type": "string",
          "description": "Cardholder name"
        }
      },
      "required": [
        "type",
        "number",
        "exp_month",
        "exp_year",
        "name"
      ],
      "examples": [
        {
          "type": "card",
          "number": "4917610000000000",
          "exp_month": "03",
          "exp_year": "2030",
          "name": "Jane Doe"
        }
      ]
    },
    "Amount": {
      "type": "object",
      "description": "The transaction amount and currency.",
      "additionalProperties": false,
      "properties": {
        "value": {
          "type": "integer",
          "description": "Amount in minor units (e.g., 1000 = €10.00)"
        },
        "currency": {
          "type": "string",
          "pattern": "^[A-Z]{3}$",
          "description": "ISO 4217 currency code"
        }
      },
      "required": [
        "value",
        "currency"
      ],
      "examples": [
        {
          "value": 1000,
          "currency": "EUR"
        }
      ]
    },
    "BrowserInfo": {
      "type": "object",
      "description": "Browser-specific metadata required for 3DS2 fingerprinting.",
      "additionalProperties": false,
      "properties": {
        "accept_header": {
          "type": "string",
          "description": "HTTP Accept header from the browser"
        },
        "ip_address": {
          "type": "string",
          "maxLength": 45,
          "description": "IP address of the browser"
        },
        "javascript_enabled": {
          "type": "boolean",
          "description": "Whether JavaScript is enabled"
        },
        "language": {
          "type": "string",
          "maxLength": 35,
          "description": "IETF BCP 47 language tag"
        },
        "user_agent": {
          "type": "string",
          "description": "Browser user agent string"
        },
        "color_depth": {
          "type": "integer",
          "description": "Screen color depth (required if javascript_enabled is true)"
        },
        "java_enabled": {
          "type": "boolean",
          "description": "Whether Java is enabled (required if javascript_enabled is true)"
        },
        "screen_height": {
          "type": "integer",
          "description": "Screen height in pixels (required if javascript_enabled is true)"
        },
        "screen_width": {
          "type": "integer",
          "description": "Screen width in pixels (required if javascript_enabled is true)"
        },
        "timezone_offset": {
          "type": "integer",
          "description": "Timezone offset in minutes (required if javascript_enabled is true)"
        }
      },
      "required": [
        "accept_header",
        "ip_address",
        "javascript_enabled",
        "language",
        "user_agent"
      ],
      "allOf": [
        {
          "if": {
            "properties": {
              "javascript_enabled": {
                "const": true
              }
            }
          },
          "then": {
            "required": [
              "color_depth",
              "java_enabled",
              "screen_height",
              "screen_width",
              "timezone_offset"
            ]
          }
        }
      ],
      "examples": [
        {
          "accept_header": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "ip_address": "192.168.1.1",
          "javascript_enabled": true,
          "language": "en-US",
          "user_agent": "Mozilla/5.0",
          "color_depth": 24,
          "java_enabled": false,
          "screen_height": 1080,
          "screen_width": 1920,
          "timezone_offset": 0
        }
      ]
    },
    "Channel": {
      "type": "object",
      "description": "The communication channel between the shopper and the merchant.",
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "browser"
          ],
          "description": "Channel type"
        },
        "browser": {
          "$ref": "#/$defs/BrowserInfo"
        }
      },
      "required": [
        "type",
        "browser"
      ],
      "examples": [
        {
          "type": "browser",
          "browser": {
            "accept_header": "text/html",
            "ip_address": "192.168.1.1",
            "javascript_enabled": false,
            "language": "en-US",
            "user_agent": "Mozilla/5.0"
          }
        }
      ]
    },
    "FlowPreference": {
      "type": "object",
      "additionalProperties": false,
      "description": "Preference for the 3DS authentication flow. Clients MAY request a preference, but issuers ultimately decide the actual flow.",
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "challenge",
            "frictionless"
          ],
          "description": "Type of flow requested"
        },
        "challenge": {
          "type": "object",
          "description": "Specific preferences if a challenge is requested.",
          "additionalProperties": false,
          "properties": {
            "type": {
              "type": "string",
              "enum": [
                "mandated",
                "preferred"
              ],
              "description": "Subtype of challenge preference"
            }
          }
        },
        "frictionless": {
          "type": "object",
          "additionalProperties": false,
          "description": "Details about the requested frictionless flow"
        }
      },
      "required": [
        "type"
      ],
      "examples": [
        {
          "type": "challenge",
          "challenge": {
            "type": "preferred"
          }
        }
      ]
    },
    "ShopperDetails": {
      "type": "object",
      "description": "Information about the shopper performing the transaction.",
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string",
          "description": "Shopper name"
        },
        "email": {
          "type": "string",
          "format": "email",
          "description": "Shopper email"
        },
        "phone_number": {
          "type": "string",
          "description": "Shopper phone number"
        },
        "address": {
          "$ref": "#/$defs/Address"
        }
      },
      "examples": [
        {
          "name": "Jane Doe",
          "email": "jane@example.com"
        }
      ]
    },
    "FingerprintAction": {
      "type": "object",
      "description": "Details for executing a 3DS fingerprinting action.",
      "additionalProperties": false,
      "properties": {
        "three_ds_method_url": {
          "type": "string",
          "format": "uri",
          "description": "URL to POST fingerprint data to via hidden iframe"
        },
        "three_ds_server_trans_id": {
          "type": "string",
          "description": "3DS Server transaction ID"
        }
      },
      "required": [
        "three_ds_method_url",
        "three_ds_server_trans_id"
      ],
      "examples": [
        {
          "three_ds_method_url": "https://acs.issuer.com/3dsmethod",
          "three_ds_server_trans_id": "abc-123-def"
        }
      ]
    },
    "ChallengeAction": {
      "type": "object",
      "description": "Details for executing a 3DS challenge action.",
      "additionalProperties": false,
      "properties": {
        "acs_url": {
          "type": "string",
          "format": "uri",
          "description": "URL to POST challenge request to"
        },
        "acs_trans_id": {
          "type": "string",
          "description": "ACS transaction identifier"
        },
        "three_ds_server_trans_id": {
          "type": "string",
          "description": "3DS Server transaction identifier"
        },
        "message_version": {
          "type": "string",
          "description": "3DS protocol version (e.g., \"2.2.0\")"
        }
      },
      "required": [
        "acs_url",
        "acs_trans_id",
        "three_ds_server_trans_id",
        "message_version"
      ],
      "examples": [
        {
          "acs_url": "https://acs.issuer.com/challenge",
          "acs_trans_id": "xyz-789",
          "three_ds_server_trans_id": "abc-123-def",
          "message_version": "2.2.0"
        }
      ]
    },
    "Action": {
      "type": "object",
      "additionalProperties": false,
      "description": "Describes browser action required",
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "fingerprint",
            "challenge"
          ],
          "description": "The type of action required"
        },
        "fingerprint": {
          "$ref": "#/$defs/FingerprintAction"
        },
        "challenge": {
          "$ref": "#/$defs/ChallengeAction"
        }
      },
      "required": [
        "type"
      ],
      "oneOf": [
        {
          "properties": {
            "type": {
              "const": "fingerprint"
            }
          },
          "required": [
            "fingerprint"
          ]
        },
        {
          "properties": {
            "type": {
              "const": "challenge"
            }
          },
          "required": [
            "challenge"
          ]
        }
      ],
      "examples": [
        {
          "type": "fingerprint",
          "fingerprint": {
            "three_ds_method_url": "https://acs.issuer.com/3dsmethod",
            "three_ds_server_trans_id": "abc-123-def"
          }
        }
      ]
    },
    "AuthenticationResult": {
      "type": "object",
      "additionalProperties": false,
      "description": "3DS authentication result returned by the authentication provider",
      "properties": {
        "trans_status": {
          "type": "string",
          "description": "Transaction status (Y, N, A, U, R, etc.)"
        },
        "electronic_commerce_indicator": {
          "type": "string",
          "description": "Electronic Commerce Indicator"
        },
        "three_ds_cryptogram": {
          "type": "string",
          "description": "Authentication cryptogram (CAVV/AAV)"
        },
        "transaction_id": {
          "type": "string",
          "description": "Directory Server transaction ID"
        },
        "three_ds_server_trans_id": {
          "type": "string",
          "description": "3DS Server transaction ID"
        },
        "version": {
          "type": "string",
          "description": "3DS protocol version"
        },
        "authentication_value": {
          "type": "string",
          "description": "Authentication value (CAVV)"
        },
        "trans_status_reason": {
          "type": "string",
          "description": "Reason code for trans_status"
        },
        "cardholder_info": {
          "type": "string",
          "description": "Message to display to cardholder"
        }
      },
      "required": [
        "trans_status",
        "transaction_id",
        "three_ds_server_trans_id",
        "version"
      ],
      "examples": [
        {
          "trans_status": "Y",
          "transaction_id": "c4e59ceb-a382-4d6a-bc87-385d591fa09d",
          "three_ds_server_trans_id": "6edcc246-23ee-4e94-ac5d-8ae620bea7d9",
          "version": "2.2.0"
        }
      ]
    },
    "DelegateAuthenticationCreateRequest": {
      "type": "object",
      "description": "Request body for creating an authentication session.",
      "additionalProperties": false,
      "properties": {
        "merchant_id": {
          "type": "string",
          "description": "Merchant identifier"
        },
        "acquirer_details": {
          "type": "object",
          "additionalProperties": false,
          "description": "Object containing acquirer data used for AReq construction. Recommended to ensure the authentication matches the final authorization.",
          "properties": {
            "acquirer_bin": {
              "type": "string",
              "maxLength": 11,
              "description": "The Acquirer BIN."
            },
            "acquirer_country": {
              "type": "string",
              "minLength": 2,
              "maxLength": 2,
              "description": "Two-letter ISO 3166-1 alpha-2 country code."
            },
            "acquirer_merchant_id": {
              "type": "string",
              "maxLength": 35,
              "description": "The Merchant ID assigned by the acquirer."
            },
            "merchant_name": {
              "type": "string",
              "maxLength": 40,
              "description": "Merchant name assigned by the acquirer."
            },
            "requestor_id": {
              "type": "string",
              "maxLength": 35,
              "description": "3DS Requestor ID (if required by directory server)."
            }
          },
          "required": [
            "acquirer_bin",
            "acquirer_country",
            "acquirer_merchant_id",
            "merchant_name"
          ]
        },
        "payment_method": {
          "$ref": "#/$defs/PaymentMethod"
        },
        "amount": {
          "$ref": "#/$defs/Amount"
        },
        "channel": {
          "$ref": "#/$defs/Channel"
        },
        "checkout_session_id": {
          "type": "string",
          "description": "Checkout session identifier"
        },
        "flow_preference": {
          "$ref": "#/$defs/FlowPreference"
        },
        "challenge_notification_url": {
          "type": "string",
          "format": "uri",
          "description": "URL for challenge result callback"
        },
        "shopper_details": {
          "$ref": "#/$defs/ShopperDetails"
        }
      },
      "required": [
        "merchant_id",
        "payment_method",
        "amount"
      ],
      "examples": [
        {
          "merchant_id": "merchant_abc123",
          "payment_method": {
            "type": "card",
            "number": "4917610000000000",
            "exp_month": "03",
            "exp_year": "2030",
            "name": "Jane Doe"
          },
          "amount": {
            "value": 1000,
            "currency": "EUR"
          }
        }
      ]
    },
    "DelegateAuthenticationAuthenticateRequest": {
      "type": "object",
      "description": "Request body for completing authentication after action.",
      "additionalProperties": false,
      "properties": {
        "fingerprint_completion": {
          "type": "string",
          "enum": [
            "Y",
            "N",
            "U"
          ],
          "description": "Result of the 3DS Method fingerprint: Y = Completed successfully, N = Timeout/not completed, U = Unavailable/not performed"
        },
        "channel": {
          "$ref": "#/$defs/Channel"
        },
        "checkout_session_id": {
          "type": "string",
          "description": "Checkout session identifier"
        },
        "challenge_notification_url": {
          "type": "string",
          "format": "uri",
          "description": "URL for challenge result callback"
        },
        "shopper_details": {
          "$ref": "#/$defs/ShopperDetails"
        }
      },
      "required": [
        "fingerprint_completion"
      ],
      "examples": [
        {
          "fingerprint_completion": "Y"
        }
      ]
    },
    "DelegateAuthenticationSessionBase": {
      "type": "object",
      "description": "Base properties for an authentication session response.",
      "additionalProperties": false,
      "properties": {
        "authentication_session_id": {
          "type": "string",
          "description": "Session ID for subsequent requests"
        },
        "status": {
          "type": "string",
          "enum": [
            "action_required",
            "pending",
            "not_supported",
            "authenticated",
            "attempted",
            "not_authenticated",
            "rejected",
            "unavailable",
            "expired",
            "challenge_abandoned"
          ],
          "description": "Session status indicating current state and next action"
        },
        "action": {
          "$ref": "#/$defs/Action"
        }
      },
      "required": [
        "authentication_session_id",
        "status"
      ],
      "examples": [
        {
          "authentication_session_id": "auth_session_abc123",
          "status": "pending"
        }
      ]
    },
    "DelegateAuthenticationSession": {
      "description": "Object representing the current state of the authentication session.",
      "allOf": [
        {
          "$ref": "#/$defs/DelegateAuthenticationSessionBase"
        }
      ],
      "examples": [
        {
          "authentication_session_id": "auth_session_abc123",
          "status": "authenticated"
        }
      ]
    },
    "DelegateAuthenticationSessionWithResult": {
      "description": "The session details including the final 3DS authentication result.",
      "allOf": [
        {
          "$ref": "#/$defs/DelegateAuthenticationSessionBase"
        },
        {
          "type": "object",
          "description": "Container for the authentication outcome",
          "properties": {
            "authentication_result": {
              "$ref": "#/$defs/AuthenticationResult"
            }
          }
        }
      ],
      "examples": [
        {
          "authentication_session_id": "auth_session_abc123",
          "status": "authenticated",
          "authentication_result": {
            "trans_status": "Y",
            "transaction_id": "c4e59ceb-a382-4d6a-bc87-385d591fa09d",
            "three_ds_server_trans_id": "6edcc246-23ee-4e94-ac5d-8ae620bea7d9",
            "version": "2.2.0"
          }
        }
      ]
    },
    "Error": {
      "type": "object",
      "description": "Standard error response format.",
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "invalid_request",
            "rate_limit_exceeded",
            "processing_error",
            "service_unavailable"
          ],
          "description": "High-level error category"
        },
        "code": {
          "type": "string",
          "enum": [
            "invalid_card",
            "duplicate_request",
            "idempotency_conflict"
          ],
          "description": "Specific error code for programmatic handling"
        },
        "message": {
          "type": "string",
          "description": "Human-readable error message"
        },
        "param": {
          "type": "string",
          "description": "JSONPath of offending field"
        }
      },
      "required": [
        "type",
        "code",
        "message"
      ],
      "examples": [
        {
          "type": "invalid_request",
          "code": "invalid_card",
          "message": "Invalid card number"
        }
      ]
    }
  }
},
  // schema.delegate_authentication.json SHA-256: e550e881594748cb9f69a68e1c5710efa326ed6d4ee5ec8a19330ef86eaa5b52
  delegatePayment: {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.com/schemas/delegate-payment/bundle.schema.json",
  "title": "Delegate Payment — Schema Bundle",
  "$defs": {
    "Address": {
      "description": "Physical address for billing or shipping purposes",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string",
          "maxLength": 256,
          "description": "Full name of the person at this address"
        },
        "line_one": {
          "type": "string",
          "maxLength": 60,
          "description": "Street address line 1 (e.g., street and number)"
        },
        "line_two": {
          "type": "string",
          "maxLength": 60,
          "description": "Street address line 2 (e.g., apartment, suite, unit)"
        },
        "city": {
          "type": "string",
          "maxLength": 60,
          "description": "City or locality"
        },
        "state": {
          "type": "string",
          "description": "State, province, or region"
        },
        "country": {
          "type": "string",
          "minLength": 2,
          "maxLength": 2,
          "description": "ISO-3166-1 alpha-2 country code"
        },
        "postal_code": {
          "type": "string",
          "maxLength": 20,
          "description": "ZIP or postal code"
        }
      },
      "required": [
        "name",
        "line_one",
        "city",
        "state",
        "country",
        "postal_code"
      ],
      "example": {
        "name": "John Smith",
        "line_one": "555 Golden Gate Avenue",
        "line_two": "Apt 401",
        "city": "San Francisco",
        "state": "CA",
        "country": "US",
        "postal_code": "94102"
      }
    },
    "PaymentMethodCard": {
      "description": "Card payment method details including card number, expiration, and verification data",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "const": "card",
          "description": "Payment method type, always 'card'"
        },
        "card_number_type": {
          "type": "string",
          "enum": [
            "fpan",
            "network_token"
          ],
          "description": "Whether the number is a raw card number (fpan) or a network token"
        },
        "number": {
          "type": "string",
          "description": "network token or fallback fpan value"
        },
        "exp_month": {
          "type": "string",
          "maxLength": 2,
          "description": "Two-digit expiration month (01-12)"
        },
        "exp_year": {
          "type": "string",
          "maxLength": 4,
          "description": "Four-digit expiration year (e.g., 2026)"
        },
        "name": {
          "type": "string",
          "description": "Cardholder name as it appears on the card"
        },
        "cvc": {
          "type": "string",
          "maxLength": 4,
          "description": "Card verification code (3 or 4 digits)"
        },
        "cryptogram": {
          "type": "string",
          "description": "Dynamic cryptogram for tokenized card transactions"
        },
        "eci_value": {
          "type": "string",
          "maxLength": 2,
          "description": "Electronic Commerce Indicator for 3DS authentication status"
        },
        "checks_performed": {
          "type": "array",
          "description": "List of verification checks performed on the card",
          "items": {
            "type": "string",
            "enum": [
              "avs",
              "cvv",
              "ani",
              "auth0"
            ]
          }
        },
        "iin": {
          "type": "string",
          "maxLength": 8,
          "description": "Issuer Identification Number (first 6 digits of card)"
        },
        "display_card_funding_type": {
          "type": "string",
          "enum": [
            "credit",
            "debit",
            "prepaid"
          ],
          "description": "Card funding type for display purposes"
        },
        "display_wallet_type": {
          "type": "string",
          "description": "Digital wallet provider if card is from a wallet (e.g., Apple Pay, Google Pay)"
        },
        "display_brand": {
          "type": "string",
          "description": "Card brand for display purposes (e.g., visa, mastercard)"
        },
        "display_last4": {
          "type": "string",
          "maxLength": 4,
          "minLength": 4,
          "pattern": "^[0-9]{4}$",
          "description": "Last 4 digits of card number for display purposes"
        },
        "metadata": {
          "type": "object",
          "description": "Additional metadata about the payment method",
          "additionalProperties": {
            "type": "string",
            "description": "Metadata value"
          }
        },
        "virtual": {
          "type": "boolean",
          "description": "Whether this is a virtual card number"
        }
      },
      "required": [
        "type",
        "card_number_type",
        "number",
        "display_card_funding_type",
        "metadata"
      ],
      "example": {
        "type": "card",
        "card_number_type": "fpan",
        "number": "4242424242424242",
        "exp_month": "12",
        "exp_year": "2027",
        "name": "John Smith",
        "cvc": "123",
        "checks_performed": [
          "avs",
          "cvv"
        ],
        "iin": "424242",
        "display_card_funding_type": "credit",
        "display_brand": "visa",
        "display_last4": "4242",
        "metadata": {
          "card_origin": "manual_entry"
        }
      }
    },
    "Allowance": {
      "description": "Constraints on how the delegated payment method can be used (amount limit, expiration, merchant)",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "reason": {
          "type": "string",
          "enum": [
            "one_time"
          ],
          "description": "Usage pattern for this allowance; currently only one_time is supported"
        },
        "max_amount": {
          "type": "integer",
          "description": "Maximum charge amount in minor units (e.g. 100 cents for $1.00 or 100 for ¥100)"
        },
        "currency": {
          "type": "string",
          "pattern": "^[a-z]{3}$",
          "description": "ISO-4217 three-letter lowercase currency code (e.g., usd)"
        },
        "checkout_session_id": {
          "type": "string",
          "description": "Identifier of the checkout session this payment is for"
        },
        "merchant_id": {
          "type": "string",
          "maxLength": 256,
          "description": "Unique identifier for the merchant authorized to use this token"
        },
        "expires_at": {
          "type": "string",
          "format": "date-time",
          "description": "ISO 8601 timestamp when this allowance expires"
        }
      },
      "required": [
        "reason",
        "max_amount",
        "currency",
        "checkout_session_id",
        "merchant_id",
        "expires_at"
      ],
      "example": {
        "reason": "one_time",
        "max_amount": 100000,
        "currency": "usd",
        "checkout_session_id": "csn_01HV3P3XYZ789",
        "merchant_id": "merchant_12345",
        "expires_at": "2026-02-15T18:30:00Z"
      }
    },
    "RiskSignal": {
      "description": "Fraud detection signal indicating detected risk patterns and recommended actions",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "card_testing"
          ],
          "description": "Type of risk signal detected"
        },
        "score": {
          "type": "integer",
          "description": "Risk score indicating severity level"
        },
        "action": {
          "type": "string",
          "enum": [
            "blocked",
            "manual_review",
            "authorized"
          ],
          "description": "Recommended action based on risk assessment"
        }
      },
      "required": [
        "type",
        "score",
        "action"
      ],
      "example": {
        "type": "card_testing",
        "score": 15,
        "action": "manual_review"
      }
    },
    "DelegatePaymentRequest": {
      "description": "Request to tokenize a payment method for delegated use by a merchant",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "payment_method": {
          "$ref": "#/$defs/PaymentMethodCard",
          "description": "The card payment method to tokenize for delegated use"
        },
        "allowance": {
          "$ref": "#/$defs/Allowance",
          "description": "Constraints on how the payment method can be used"
        },
        "billing_address": {
          "$ref": "#/$defs/Address",
          "description": "Billing address associated with the payment method"
        },
        "risk_signals": {
          "type": "array",
          "description": "List of risk assessment signals from fraud detection",
          "items": {
            "$ref": "#/$defs/RiskSignal"
          }
        },
        "metadata": {
          "type": "object",
          "description": "Additional metadata for the request",
          "additionalProperties": {
            "type": "string",
            "description": "Metadata value"
          }
        }
      },
      "required": [
        "payment_method",
        "allowance",
        "risk_signals",
        "metadata"
      ],
      "example": {
        "payment_method": {
          "type": "card",
          "card_number_type": "fpan",
          "number": "4242424242424242",
          "exp_month": "11",
          "exp_year": "2026",
          "name": "Jane Doe",
          "cvc": "223",
          "checks_performed": [
            "avs",
            "cvv"
          ],
          "iin": "424242",
          "display_card_funding_type": "credit",
          "display_brand": "visa",
          "display_last4": "4242",
          "metadata": {}
        },
        "allowance": {
          "reason": "one_time",
          "max_amount": 5000,
          "currency": "usd",
          "checkout_session_id": "cs_01HV3P3ABC123",
          "merchant_id": "acme_corp",
          "expires_at": "2026-02-13T12:00:00Z"
        },
        "billing_address": {
          "name": "Jane Doe",
          "line_one": "185 Berry Street",
          "line_two": "Suite 550",
          "city": "San Francisco",
          "state": "CA",
          "country": "US",
          "postal_code": "94107"
        },
        "risk_signals": [
          {
            "type": "card_testing",
            "score": 5,
            "action": "authorized"
          }
        ],
        "metadata": {
          "session_id": "sess_abc123",
          "user_agent": "ChatGPT/2.0"
        }
      }
    },
    "DelegatePaymentResponse": {
      "description": "Response containing the vault token identifier for the delegated payment method",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "description": "Unique vault token identifier (vt_...)"
        },
        "created": {
          "type": "string",
          "format": "date-time",
          "description": "ISO 8601 timestamp when the token was created"
        },
        "metadata": {
          "type": "object",
          "description": "Metadata echoed from the request plus system-added fields",
          "additionalProperties": {
            "type": "string",
            "description": "Metadata value"
          }
        }
      },
      "required": [
        "id",
        "created",
        "metadata"
      ],
      "example": {
        "id": "vt_01J8Z3WXYZ9ABC123",
        "created": "2026-02-12T14:30:00Z",
        "metadata": {
          "source": "agent_checkout",
          "merchant_id": "acme_corp",
          "idempotency_key": "idem_xyz789"
        }
      }
    },
    "Error": {
      "description": "Error response for delegate payment API requests",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "invalid_request",
            "rate_limit_exceeded",
            "processing_error",
            "service_unavailable"
          ],
          "description": "High-level error category"
        },
        "code": {
          "type": "string",
          "enum": [
            "invalid_card",
            "duplicate_request",
            "idempotency_conflict",
            "too_many_requests",
            "idempotency_key_required",
            "idempotency_in_flight"
          ],
          "description": "Specific error code for programmatic handling"
        },
        "message": {
          "type": "string",
          "description": "Human-readable error message"
        },
        "param": {
          "type": "string",
          "description": "JSONPath of offending field"
        },
        "supported_versions": {
          "type": "array",
          "items": {
            "type": "string",
            "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
            "description": "API version in YYYY-MM-DD format"
          },
          "description": "List of API versions supported by the server, ordered by preference (newest first). Only included in version-related errors."
        }
      },
      "required": [
        "type",
        "code",
        "message"
      ],
      "example": {
        "type": "invalid_request",
        "code": "invalid_card",
        "message": "Invalid card expiration year",
        "param": "$.payment_method.exp_year"
      }
    }
  }
},
  // schema.delegate_payment.json SHA-256: 307739ae400e7368eaa25c6024d30751348a4af8a516d071565fcd8aa328cf4d
  discount: {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://agentic-commerce-protocol.com/schemas/discount.json",
  "title": "Discount Extension",
  "description": "Extends Checkout with discount code support, enabling agents to apply promotional, loyalty, referral, and other discount codes. Version: 2026-01-27.",
  "$defs": {
    "allocation": {
      "type": "object",
      "description": "Breakdown of how a discount amount was allocated to a specific target.",
      "required": [
        "path",
        "amount"
      ],
      "properties": {
        "path": {
          "type": "string",
          "description": "JSONPath to the allocation target (e.g., '$.line_items[0]', '$.totals.shipping')."
        },
        "amount": {
          "type": "integer",
          "minimum": 0,
          "description": "Amount allocated to this target in minor (cents) currency units."
        }
      },
      "additionalProperties": false,
      "example": {
        "path": "$.line_items[0]",
        "amount": 500
      }
    },
    "coupon": {
      "type": "object",
      "description": "Coupon details describing the discount terms.",
      "required": [
        "id",
        "name"
      ],
      "properties": {
        "id": {
          "type": "string",
          "description": "Unique identifier for the coupon."
        },
        "name": {
          "type": "string",
          "description": "Human-readable coupon name (e.g., 'Summer Sale 20% Off')."
        },
        "percent_off": {
          "type": "number",
          "minimum": 0,
          "maximum": 100,
          "description": "Percentage discount (0-100). Mutually exclusive with amount_off."
        },
        "amount_off": {
          "type": "integer",
          "minimum": 0,
          "description": "Fixed discount amount in minor currency units. Mutually exclusive with percent_off."
        },
        "currency": {
          "type": "string",
          "pattern": "^[a-z]{3}$",
          "description": "ISO 4217 currency code for amount_off. Required if amount_off is set."
        },
        "duration": {
          "type": "string",
          "enum": [
            "once",
            "repeating",
            "forever"
          ],
          "description": "How long the discount applies. 'once' = single use, 'repeating' = multiple billing periods, 'forever' = indefinitely."
        },
        "duration_in_months": {
          "type": "integer",
          "minimum": 1,
          "description": "Number of months the coupon applies if duration is 'repeating'."
        },
        "max_redemptions": {
          "type": "integer",
          "minimum": 1,
          "description": "Maximum number of times this coupon can be redeemed across all customers."
        },
        "times_redeemed": {
          "type": "integer",
          "minimum": 0,
          "description": "Number of times this coupon has been redeemed."
        },
        "metadata": {
          "type": "object",
          "additionalProperties": {
            "type": "string",
            "description": "Metadata value"
          },
          "description": "Arbitrary key-value metadata attached to the coupon."
        }
      },
      "additionalProperties": false,
      "example": {
        "id": "coupon_abc123",
        "name": "Summer Sale 20% Off",
        "percent_off": 20,
        "duration": "once",
        "metadata": {
          "campaign": "summer_2026"
        }
      }
    },
    "applied_discount": {
      "type": "object",
      "description": "A discount that was successfully applied to the checkout session.",
      "required": [
        "id",
        "coupon",
        "amount"
      ],
      "properties": {
        "id": {
          "type": "string",
          "description": "Unique identifier for this applied discount instance."
        },
        "code": {
          "type": "string",
          "description": "The discount code entered by the user. Omitted for automatic discounts."
        },
        "coupon": {
          "$ref": "#/$defs/coupon",
          "description": "Details about the underlying coupon/promotion."
        },
        "amount": {
          "type": "integer",
          "minimum": 0,
          "description": "Total discount amount in minor (cents) currency units."
        },
        "automatic": {
          "type": "boolean",
          "default": false,
          "description": "True if applied automatically by merchant rules (no code required)."
        },
        "start": {
          "type": "string",
          "format": "date-time",
          "description": "RFC 3339 timestamp when the discount became active."
        },
        "end": {
          "type": "string",
          "format": "date-time",
          "description": "RFC 3339 timestamp when the discount expires."
        },
        "method": {
          "type": "string",
          "enum": [
            "each",
            "across"
          ],
          "description": "Allocation method. 'each' = applied independently per item (allocations typically included). 'across' = applied to order total (allocations typically omitted)."
        },
        "priority": {
          "type": "integer",
          "minimum": 1,
          "description": "Stacking order for discount calculation. Lower numbers applied first (1 = first)."
        },
        "allocations": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/allocation"
          },
          "description": "Breakdown of where this discount was allocated. Sum of allocation amounts equals total amount."
        }
      },
      "additionalProperties": false,
      "example": {
        "id": "disc_123",
        "code": "SAVE20",
        "coupon": {
          "id": "coupon_abc",
          "name": "20% Off Summer Sale",
          "percent_off": 20
        },
        "amount": 1000,
        "automatic": false
      }
    },
    "rejected_discount": {
      "type": "object",
      "description": "A discount code that could not be applied, with the reason.",
      "required": [
        "code",
        "reason"
      ],
      "properties": {
        "code": {
          "type": "string",
          "description": "The discount code that was rejected."
        },
        "reason": {
          "$ref": "#/$defs/discount_error_codes",
          "description": "Error code indicating why the discount was rejected."
        },
        "message": {
          "type": "string",
          "description": "Human-readable explanation of why the code was rejected."
        }
      },
      "additionalProperties": false,
      "example": {
        "code": "EXPIRED10",
        "reason": "discount_code_expired",
        "message": "This discount code has expired"
      }
    },
    "discounts_request": {
      "type": "object",
      "description": "Discount codes input for checkout create/update requests.",
      "properties": {
        "codes": {
          "type": "array",
          "items": {
            "type": "string",
            "description": "Discount code to apply"
          },
          "description": "Discount codes to apply. Case-insensitive. Replaces previously submitted codes. Send empty array to clear."
        }
      },
      "additionalProperties": false,
      "example": {
        "codes": [
          "SAVE20",
          "FREESHIP"
        ]
      }
    },
    "discounts_response": {
      "type": "object",
      "description": "Discount codes input, applied discounts, and rejected codes in checkout responses.",
      "properties": {
        "codes": {
          "type": "array",
          "items": {
            "type": "string",
            "description": "Discount code submitted"
          },
          "description": "Echo of submitted discount codes."
        },
        "applied": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/applied_discount"
          },
          "description": "Discounts successfully applied (code-based and automatic)."
        },
        "rejected": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/rejected_discount"
          },
          "description": "Discount codes that could not be applied, with reasons."
        }
      },
      "additionalProperties": false,
      "example": {
        "codes": [
          "SAVE20"
        ],
        "applied": [
          {
            "id": "disc_123",
            "code": "SAVE20",
            "coupon": {
              "id": "coupon_abc",
              "name": "20% Off Summer Sale",
              "percent_off": 20
            },
            "amount": 1000
          }
        ],
        "rejected": []
      }
    },
    "discount_error_codes": {
      "type": "string",
      "enum": [
        "discount_code_expired",
        "discount_code_invalid",
        "discount_code_already_applied",
        "discount_code_combination_disallowed",
        "discount_code_minimum_not_met",
        "discount_code_user_not_logged_in",
        "discount_code_user_ineligible",
        "discount_code_usage_limit_reached"
      ],
      "description": "Error codes for rejected discount codes, used in messages[].code.",
      "example": "discount_code_expired"
    },
    "checkout_with_discount": {
      "title": "Checkout with Discount Extension",
      "description": "Checkout session extended with discount capability.",
      "allOf": [
        {
          "$ref": "schema.agentic_checkout.json#/$defs/CheckoutSessionBase"
        },
        {
          "type": "object",
          "properties": {
            "discounts": {
              "$ref": "#/$defs/discounts_response",
              "description": "Discount codes and applied discounts for this checkout session."
            }
          },
          "description": "Discount extension fields"
        }
      ],
      "example": {
        "id": "cs_abc123",
        "status": "ready_for_payment",
        "currency": "usd",
        "line_items": [],
        "totals": {
          "currency": "usd",
          "total": 5000
        },
        "fulfillment_options": [],
        "messages": [],
        "links": [],
        "capabilities": {},
        "discounts": {
          "codes": [
            "SAVE20"
          ],
          "applied": [
            {
              "id": "disc_123",
              "code": "SAVE20",
              "coupon": {
                "id": "coupon_abc",
                "name": "20% Off",
                "percent_off": 20
              },
              "amount": 1000
            }
          ],
          "rejected": []
        }
      }
    },
    "checkout_create_request_with_discount": {
      "title": "Checkout Create Request with Discount Extension",
      "description": "Checkout session create request extended with discount codes.",
      "allOf": [
        {
          "$ref": "schema.agentic_checkout.json#/$defs/CheckoutSessionCreateRequest"
        },
        {
          "type": "object",
          "properties": {
            "discounts": {
              "$ref": "#/$defs/discounts_request",
              "description": "Discount codes to apply to the new checkout session."
            }
          },
          "description": "Discount extension fields for create request"
        }
      ],
      "example": {
        "items": [
          {
            "product_id": "prod_123",
            "quantity": 1
          }
        ],
        "currency": "usd",
        "capabilities": {},
        "discounts": {
          "codes": [
            "SAVE20"
          ]
        }
      }
    },
    "checkout_update_request_with_discount": {
      "title": "Checkout Update Request with Discount Extension",
      "description": "Checkout session update request extended with discount codes.",
      "allOf": [
        {
          "$ref": "schema.agentic_checkout.json#/$defs/CheckoutSessionUpdateRequest"
        },
        {
          "type": "object",
          "properties": {
            "discounts": {
              "$ref": "#/$defs/discounts_request",
              "description": "Discount codes to apply. Replaces previously submitted codes."
            }
          },
          "description": "Discount extension fields for update request"
        }
      ],
      "example": {
        "buyer": {
          "email": "customer@example.com"
        },
        "discounts": {
          "codes": [
            "SAVE20",
            "FREESHIP"
          ]
        }
      }
    }
  }
},
  // schema.discount.json SHA-256: 792ca48fca11bd1363ce0c5c74aa42b1f5fd5ba5eb3adb8582a4bef872c092ae
  extension: {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://agentic-commerce-protocol.com/schemas/extension.json",
  "title": "ACP Extension Schema",
  "description": "Schema definitions for the ACP Extensions Framework. Extensions are optional, composable capabilities declared in capabilities.extensions.",
  "$defs": {
    "extension_identifier": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_-]*(@\\d{4}-\\d{2}-\\d{2})?$|^[a-z][a-z0-9]*(?:\\.[a-z][a-z0-9_-]*)+(@\\d{4}-\\d{2}-\\d{2})?$",
      "description": "Extension identifier. Core extensions use simple names (e.g., 'discount'). Third-party extensions use reverse-domain naming (e.g., 'com.example.custom'). May include optional version suffix (e.g., 'discount@2026-01-27').",
      "example": "discount"
    },
    "extends_target": {
      "type": "string",
      "pattern": "^\\$\\.[A-Za-z][A-Za-z0-9]*(\\.[A-Za-z][A-Za-z0-9_]*)*$",
      "description": "JSONPath expression identifying the schema field added by this extension. Format: $.<SchemaName>.<fieldName> (e.g., $.CheckoutSession.discounts).",
      "example": "$.CheckoutSession.discounts"
    },
    "extension_declaration": {
      "type": "object",
      "description": "Extension declaration in capabilities.extensions (response). Describes an active extension and which schema fields it adds.",
      "required": [
        "name"
      ],
      "properties": {
        "name": {
          "$ref": "#/$defs/extension_identifier",
          "description": "Unique identifier for the extension."
        },
        "extends": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/extends_target"
          },
          "uniqueItems": true,
          "description": "JSONPath expressions identifying the schema fields added by this extension (e.g., $.CheckoutSession.discounts)."
        },
        "schema": {
          "type": "string",
          "format": "uri",
          "description": "URL to the extension's JSON Schema definition."
        },
        "spec": {
          "type": "string",
          "format": "uri",
          "description": "URL to the extension's specification document."
        }
      },
      "additionalProperties": false,
      "example": {
        "name": "discount",
        "extends": [
          "$.CheckoutSession.discounts",
          "$.CheckoutSessionCreateRequest.discounts"
        ],
        "schema": "https://example.com/schemas/extensions/discount.json",
        "spec": "https://example.com/specs/extensions/discount"
      }
    },
    "request_extensions": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/extension_identifier"
      },
      "uniqueItems": true,
      "description": "Extensions the agent understands. Sent in request capabilities.extensions.",
      "example": [
        "discount",
        "affiliate_attribution"
      ]
    },
    "response_extensions": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/extension_declaration"
      },
      "uniqueItems": true,
      "description": "Active extensions for this session. Returned in response capabilities.extensions.",
      "example": [
        {
          "name": "discount",
          "extends": [
            "$.CheckoutSession.discounts"
          ],
          "schema": "https://example.com/schemas/extensions/discount.json"
        }
      ]
    },
    "extension_metadata": {
      "type": "object",
      "description": "Full metadata about an extension for documentation and discovery.",
      "required": [
        "id",
        "name"
      ],
      "properties": {
        "id": {
          "$ref": "#/$defs/extension_identifier",
          "description": "Unique identifier for the extension."
        },
        "name": {
          "type": "string",
          "description": "Human-readable name for the extension."
        },
        "description": {
          "type": "string",
          "description": "Brief description of what the extension provides."
        },
        "extends": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/extends_target"
          },
          "description": "JSONPath expressions identifying the schema fields added by this extension."
        },
        "spec": {
          "type": "string",
          "format": "uri",
          "description": "URL to the extension specification document."
        },
        "schema": {
          "type": "string",
          "format": "uri",
          "description": "URL to the extension JSON Schema."
        },
        "status": {
          "type": "string",
          "enum": [
            "draft",
            "experimental",
            "stable",
            "deprecated",
            "retired"
          ],
          "description": "Lifecycle status of the extension."
        },
        "depends_on": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/extension_identifier"
          },
          "description": "Extensions that this extension depends on."
        }
      },
      "additionalProperties": true,
      "example": {
        "id": "discount",
        "name": "Discount Extension",
        "description": "Discount code support with rich applied discounts",
        "extends": [
          "$.CheckoutSession.discounts"
        ],
        "spec": "https://example.com/specs/extensions/discount",
        "schema": "https://example.com/schemas/extensions/discount.json",
        "status": "stable"
      }
    },
    "core_extensions": {
      "type": "object",
      "description": "Registry of core ACP extensions.",
      "properties": {
        "discount": {
          "allOf": [
            {
              "$ref": "#/$defs/extension_metadata"
            },
            {
              "type": "object",
              "properties": {
                "id": {
                  "const": "discount"
                },
                "name": {
                  "const": "Discount Extension"
                },
                "description": {
                  "const": "Discount code support with rich applied discounts, allocation details, and rejection messaging."
                },
                "extends": {
                  "const": [
                    "$.CheckoutSessionCreateRequest.discounts",
                    "$.CheckoutSessionUpdateRequest.discounts",
                    "$.CheckoutSession.discounts"
                  ]
                }
              },
              "description": "Discount extension metadata"
            }
          ]
        }
      },
      "example": {
        "discount": {
          "id": "discount",
          "name": "Discount Extension",
          "description": "Discount code support with rich applied discounts, allocation details, and rejection messaging.",
          "extends": [
            "$.CheckoutSessionCreateRequest.discounts",
            "$.CheckoutSessionUpdateRequest.discounts",
            "$.CheckoutSession.discounts"
          ],
          "status": "stable"
        }
      }
    }
  }
},
  // schema.extension.json SHA-256: 08a4415d66413e712f5a9ceb9fbe651f9a8e4c5c795ce1f7019ffda7d238cfd4
  feed: {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.com/schemas/feed/bundle.schema.json",
  "title": "Feed - Schema Bundle",
  "$defs": {
    "Description": {
      "description": "Structured long-form or rich-text description content for a product or variant.",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "plain": {
          "type": "string",
          "description": "Plain-text description intended for clients that do not render rich formatting."
        },
        "html": {
          "type": "string",
          "description": "HTML-formatted description content."
        },
        "markdown": {
          "type": "string",
          "description": "Markdown-formatted description content."
        }
      },
      "minProperties": 1,
      "example": {
        "plain": "Classic cotton tee in red, size small."
      }
    },
    "Price": {
      "description": "Monetary amount expressed in minor units with an associated ISO 4217 currency code.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "amount",
        "currency"
      ],
      "properties": {
        "amount": {
          "type": "integer",
          "minimum": 0,
          "description": "Monetary amount expressed in ISO 4217 minor units."
        },
        "currency": {
          "type": "string",
          "pattern": "^[A-Z]{3}$",
          "description": "Three-letter ISO 4217 currency identifier."
        }
      },
      "example": {
        "amount": 1999,
        "currency": "USD"
      }
    },
    "Availability": {
      "description": "Purchasability and fulfillment state for a variant.",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "available": {
          "type": "boolean",
          "description": "Indicates whether the variant is currently purchasable. Use status for fulfillment context."
        },
        "status": {
          "type": "string",
          "description": "Extensible fulfillment state for the variant. Known values include in_stock, limited_stock, backorder, preorder, out_of_stock, and discontinued."
        }
      },
      "example": {
        "available": true,
        "status": "in_stock"
      }
    },
    "Barcode": {
      "description": "Machine-readable identifier attached to a variant, such as a GTIN or UPC.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "value"
      ],
      "properties": {
        "type": {
          "type": "string",
          "description": "Barcode scheme or identifier type, such as GTIN, UPC, or EAN."
        },
        "value": {
          "type": "string",
          "description": "Raw barcode value as provided by the merchant."
        }
      },
      "example": {
        "type": "GTIN",
        "value": "00012345600012"
      }
    },
    "Media": {
      "description": "Media asset associated with a product or variant.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "url"
      ],
      "properties": {
        "type": {
          "type": "string",
          "description": "Media kind, such as image, video, or model."
        },
        "url": {
          "type": "string",
          "format": "uri",
          "description": "Canonical URL where the media asset can be retrieved."
        },
        "alt_text": {
          "type": "string",
          "description": "Human-readable alternate text describing the asset."
        },
        "width": {
          "type": "integer",
          "description": "Rendered width of the asset in pixels, when known."
        },
        "height": {
          "type": "integer",
          "description": "Rendered height of the asset in pixels, when known."
        }
      },
      "example": {
        "type": "image",
        "url": "https://cdn.merchant.com/products/classic-tee/main.jpg",
        "alt_text": "Classic Tee front view"
      }
    },
    "VariantOption": {
      "description": "One selected characteristic of a variant, such as size or color.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "name",
        "value"
      ],
      "properties": {
        "name": {
          "type": "string",
          "description": "Display name of the option dimension, such as Color or Size."
        },
        "value": {
          "type": "string",
          "description": "Selected option value for this variant."
        }
      },
      "example": {
        "name": "Color",
        "value": "Red"
      }
    },
    "Category": {
      "description": "Category assignment for a product or variant within a specific taxonomy.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "value"
      ],
      "properties": {
        "value": {
          "type": "string",
          "description": "Category label or hierarchical path, for example Mens > Sweaters > Crewnecks."
        },
        "taxonomy": {
          "type": "string",
          "description": "Names the taxonomy system used for the category value, such as google_product_category, shopify, or merchant."
        }
      },
      "example": {
        "value": "Apparel > Shirts",
        "taxonomy": "merchant"
      }
    },
    "Link": {
      "description": "Merchant-provided informational or policy link associated with a seller.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "url"
      ],
      "properties": {
        "type": {
          "type": "string",
          "description": "Extensible link type, such as privacy_policy, terms_of_service, refund_policy, shipping_policy, or faq."
        },
        "title": {
          "type": "string",
          "description": "Human-readable label for the linked resource."
        },
        "url": {
          "type": "string",
          "format": "uri",
          "description": "Canonical URL for the linked resource."
        }
      },
      "example": {
        "type": "shipping_policy",
        "title": "Shipping Policy",
        "url": "https://merchant.com/policies/shipping"
      }
    },
    "Seller": {
      "description": "Merchant or seller identity associated with a variant offer.",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string",
          "description": "Display name of the seller or merchant of record."
        },
        "links": {
          "type": "array",
          "description": "Informational or policy links associated with this seller.",
          "items": {
            "$ref": "#/$defs/Link"
          }
        }
      },
      "example": {
        "name": "Example Merchant",
        "links": [
          {
            "type": "refund_policy",
            "title": "Refund Policy",
            "url": "https://merchant.com/policies/refunds"
          }
        ]
      }
    },
    "Condition": {
      "description": "Extensible list of applicable item conditions, such as new or secondhand.",
      "type": "array",
      "items": {
        "type": "string",
        "description": "Condition label supplied by the merchant."
      },
      "example": [
        "new"
      ]
    },
    "Measure": {
      "description": "Measured quantity paired with a unit for unit-price calculations.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "value",
        "unit"
      ],
      "properties": {
        "value": {
          "type": "number",
          "description": "Measured quantity for the package or item."
        },
        "unit": {
          "type": "string",
          "description": "Unit label for the measured quantity, such as oz, ml, or kg."
        }
      },
      "example": {
        "value": 12,
        "unit": "oz"
      }
    },
    "ReferenceMeasure": {
      "description": "Reference unit used when normalizing a unit price for display.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "value",
        "unit"
      ],
      "properties": {
        "value": {
          "type": "integer",
          "description": "Reference quantity used to normalize the unit price."
        },
        "unit": {
          "type": "string",
          "description": "Reference unit label, such as ml, g, or oz."
        }
      },
      "example": {
        "value": 100,
        "unit": "ml"
      }
    },
    "UnitPrice": {
      "description": "Normalized unit price for products sold by weight, volume, or measure.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "amount",
        "currency",
        "measure",
        "reference"
      ],
      "properties": {
        "amount": {
          "type": "integer",
          "minimum": 0,
          "description": "Normalized price amount expressed in ISO 4217 minor units."
        },
        "currency": {
          "type": "string",
          "pattern": "^[A-Z]{3}$",
          "description": "Three-letter ISO 4217 currency identifier."
        },
        "measure": {
          "$ref": "#/$defs/Measure",
          "description": "Actual packaged measure associated with the sale item."
        },
        "reference": {
          "$ref": "#/$defs/ReferenceMeasure",
          "description": "Reference measure used to display the normalized unit price."
        }
      },
      "example": {
        "amount": 499,
        "currency": "USD",
        "measure": {
          "value": 12,
          "unit": "oz"
        },
        "reference": {
          "value": 1,
          "unit": "oz"
        }
      }
    },
    "Variant": {
      "description": "Purchasable variant of a product within a feed.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "title"
      ],
      "properties": {
        "id": {
          "type": "string",
          "description": "Stable global identifier for this variant."
        },
        "title": {
          "type": "string",
          "description": "Display title for the variant."
        },
        "description": {
          "$ref": "#/$defs/Description",
          "description": "Structured description content for the variant."
        },
        "url": {
          "type": "string",
          "format": "uri",
          "description": "Canonical URL for the variant detail page."
        },
        "barcodes": {
          "type": "array",
          "description": "Machine-readable identifiers associated with this variant.",
          "items": {
            "$ref": "#/$defs/Barcode"
          }
        },
        "price": {
          "$ref": "#/$defs/Price",
          "description": "Active selling price for the variant."
        },
        "list_price": {
          "$ref": "#/$defs/Price",
          "description": "Reference or pre-discount price for the variant."
        },
        "unit_price": {
          "$ref": "#/$defs/UnitPrice",
          "description": "Normalized unit price, when applicable."
        },
        "availability": {
          "$ref": "#/$defs/Availability",
          "description": "Purchasability and fulfillment state for the variant."
        },
        "categories": {
          "type": "array",
          "description": "Category assignments associated with this variant.",
          "items": {
            "$ref": "#/$defs/Category"
          }
        },
        "condition": {
          "$ref": "#/$defs/Condition",
          "description": "Extensible list of conditions applicable to this variant."
        },
        "variant_options": {
          "type": "array",
          "description": "Option selections that distinguish this variant, such as Color: Red or Size: Small.",
          "items": {
            "$ref": "#/$defs/VariantOption"
          }
        },
        "media": {
          "type": "array",
          "description": "Media assets specific to this variant. The first item is the primary listing asset.",
          "items": {
            "$ref": "#/$defs/Media"
          }
        },
        "seller": {
          "$ref": "#/$defs/Seller",
          "description": "Seller or merchant of record for this variant."
        },
        "marketplace": {
          "$ref": "#/$defs/Seller",
          "description": "Marketplace or intermediary platform through which this variant is offered, if applicable."
        }
      },
      "example": {
        "id": "sku123-red-s",
        "title": "Classic Tee - Red / Small",
        "description": {
          "plain": "Classic cotton tee in red, size small."
        },
        "url": "https://merchant.com/products/classic-tee?variant=sku123-red-s",
        "barcodes": [
          {
            "type": "GTIN",
            "value": "00012345600012"
          }
        ],
        "price": {
          "amount": 1999,
          "currency": "USD"
        },
        "list_price": {
          "amount": 2499,
          "currency": "USD"
        },
        "availability": {
          "available": true,
          "status": "in_stock"
        },
        "variant_options": [
          {
            "name": "Color",
            "value": "Red"
          },
          {
            "name": "Size",
            "value": "Small"
          }
        ],
        "media": [
          {
            "type": "image",
            "url": "https://cdn.merchant.com/products/classic-tee/red-small-1.jpg",
            "alt_text": "Classic Tee in red, size small"
          }
        ],
        "seller": {
          "name": "Example Merchant"
        },
        "marketplace": {
          "name": "Example Marketplace"
        }
      }
    },
    "Product": {
      "description": "Catalog product grouping one or more purchasable variants within a feed.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "variants"
      ],
      "properties": {
        "id": {
          "type": "string",
          "description": "Stable global identifier for this product."
        },
        "title": {
          "type": "string",
          "description": "Display title for the product."
        },
        "description": {
          "$ref": "#/$defs/Description",
          "description": "Structured description content for the product."
        },
        "url": {
          "type": "string",
          "format": "uri",
          "description": "Canonical URL for the product detail page."
        },
        "media": {
          "type": "array",
          "description": "Media assets associated with the product.",
          "items": {
            "$ref": "#/$defs/Media"
          }
        },
        "variants": {
          "type": "array",
          "description": "Purchasable variants grouped under this product.",
          "items": {
            "$ref": "#/$defs/Variant"
          }
        }
      },
      "example": {
        "id": "prod_classic_tee",
        "title": "Classic Tee",
        "media": [
          {
            "type": "image",
            "url": "https://cdn.merchant.com/products/classic-tee/main.jpg",
            "alt_text": "Classic Tee front view"
          }
        ],
        "variants": [
          {
            "id": "sku123-red-s",
            "title": "Classic Tee - Red / Small"
          }
        ]
      }
    },
    "FeedMetadata": {
      "description": "Server-managed metadata describing a feed resource.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id"
      ],
      "properties": {
        "id": {
          "type": "string",
          "description": "Stable identifier for the feed resource."
        },
        "target_country": {
          "type": "string",
          "pattern": "^[A-Z]{2}$",
          "description": "Optional ISO 3166-1 alpha-2 country code describing the feed's target market."
        },
        "updated_at": {
          "type": "string",
          "format": "date-time",
          "description": "Timestamp of the most recent update applied to this feed."
        }
      },
      "example": {
        "id": "feed_8f3K2x",
        "target_country": "US",
        "updated_at": "2026-03-01T00:00:00Z"
      }
    },
    "CreateFeedRequest": {
      "description": "Request payload used to create a feed.",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "target_country": {
          "type": "string",
          "pattern": "^[A-Z]{2}$",
          "description": "Optional ISO 3166-1 alpha-2 country code describing the feed's target market."
        }
      },
      "example": {
        "target_country": "US"
      }
    },
    "ProductsResponse": {
      "description": "Response envelope containing the current product set for a feed.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "products"
      ],
      "properties": {
        "products": {
          "type": "array",
          "description": "Full list of products currently associated with the feed.",
          "items": {
            "$ref": "#/$defs/Product"
          }
        }
      },
      "example": {
        "products": [
          {
            "id": "prod_classic_tee",
            "title": "Classic Tee",
            "variants": [
              {
                "id": "sku123-red-s",
                "title": "Classic Tee - Red / Small"
              }
            ]
          }
        ]
      }
    },
    "UpsertProductsRequest": {
      "description": "Request payload that partially upserts products into a feed. Products omitted from the request remain unchanged.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "products"
      ],
      "properties": {
        "products": {
          "type": "array",
          "description": "Subset of products to create or update within the feed, matched by Product.id.",
          "items": {
            "$ref": "#/$defs/Product"
          }
        }
      },
      "example": {
        "products": [
          {
            "id": "prod_classic_tee",
            "title": "Classic Tee",
            "variants": [
              {
                "id": "sku124-red-m",
                "title": "Classic Tee - Red / Medium",
                "availability": {
                  "available": false,
                  "status": "out_of_stock"
                }
              }
            ]
          }
        ]
      }
    },
    "Error": {
      "description": "Structured error returned when a feed request cannot be fulfilled.",
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "code",
        "message"
      ],
      "properties": {
        "type": {
          "type": "string",
          "description": "High-level error category."
        },
        "code": {
          "type": "string",
          "description": "Machine-readable error code for programmatic handling."
        },
        "message": {
          "type": "string",
          "description": "Human-readable explanation of the error."
        },
        "param": {
          "type": "string",
          "description": "Optional request parameter or field associated with the error."
        }
      },
      "example": {
        "type": "invalid_request",
        "code": "feed_not_found",
        "message": "Feed not found",
        "param": "id"
      }
    }
  }
},
  // schema.feed.json SHA-256: 5ef3eea431f6a860bb810793843018c8ea5b8c17aa60420ad66ebec3575189c4
});
