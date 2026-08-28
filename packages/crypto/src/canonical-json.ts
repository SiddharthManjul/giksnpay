export type JsonPrimitive = boolean | null | number | string;

export type JsonValue =
  | JsonPrimitive
  | { readonly [key: string]: JsonValue }
  | readonly JsonValue[];

export type CanonicalJsonErrorCode =
  | "CYCLIC_VALUE"
  | "INVALID_NUMBER"
  | "INVALID_OBJECT"
  | "INVALID_UNICODE"
  | "NON_JSON_VALUE";

/**
 * Raised when a value cannot be represented unambiguously as RFC 8785 JSON.
 */
export class CanonicalJsonError extends TypeError {
  readonly code: CanonicalJsonErrorCode;

  constructor(code: CanonicalJsonErrorCode, message: string) {
    super(message);
    this.name = "CanonicalJsonError";
    this.code = code;
  }
}

/**
 * Serializes pure JSON data using the JSON Canonicalization Scheme from RFC 8785.
 *
 * This is a signing boundary, so inputs that ordinary JSON.stringify would omit
 * or coerce are rejected instead. Accessors are never invoked.
 */
export function canonicalizeJson(value: unknown): string {
  return serializeValue(value, new WeakSet<object>());
}

/** Returns the exact UTF-8 bytes that should be signed or hashed. */
export function canonicalizeJsonBytes(value: unknown): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(canonicalizeJson(value));
}

function serializeValue(value: unknown, activeObjects: WeakSet<object>): string {
  if (value === null) {
    return "null";
  }

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return serializeNumber(value);
    case "string":
      return serializeString(value);
    case "object":
      return serializeObject(value, activeObjects);
    default:
      throw new CanonicalJsonError(
        "NON_JSON_VALUE",
        `Cannot canonicalize a value of type ${typeof value}`,
      );
  }
}

function serializeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new CanonicalJsonError("INVALID_NUMBER", "JSON numbers must be finite");
  }

  // JSON.stringify uses ECMAScript's shortest round-trippable binary64 form,
  // including the RFC-required normalization of negative zero to zero.
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new CanonicalJsonError("INVALID_NUMBER", "Number could not be serialized");
  }

  return serialized;
}

function serializeString(value: string): string {
  assertValidUnicode(value);

  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new CanonicalJsonError("NON_JSON_VALUE", "String could not be serialized");
  }

  return serialized;
}

function serializeObject(value: object, activeObjects: WeakSet<object>): string {
  if (activeObjects.has(value)) {
    throw new CanonicalJsonError("CYCLIC_VALUE", "Canonical JSON cannot contain cycles");
  }

  activeObjects.add(value);
  try {
    if (Array.isArray(value)) {
      return serializeArray(value, activeObjects);
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new CanonicalJsonError(
        "INVALID_OBJECT",
        "Canonical JSON objects must have Object.prototype or a null prototype",
      );
    }

    return serializeRecord(value, activeObjects);
  } finally {
    activeObjects.delete(value);
  }
}

function serializeArray(value: readonly unknown[], activeObjects: WeakSet<object>): string {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new CanonicalJsonError("INVALID_OBJECT", "JSON arrays cannot have symbol properties");
  }

  const propertyNames = Object.getOwnPropertyNames(value);
  if (propertyNames.length !== value.length + 1 || !propertyNames.includes("length")) {
    throw new CanonicalJsonError(
      "INVALID_OBJECT",
      "JSON arrays must be dense and cannot have extra properties",
    );
  }

  const serializedItems: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new CanonicalJsonError(
        "INVALID_OBJECT",
        "JSON arrays must contain enumerable data properties at every index",
      );
    }

    serializedItems.push(serializeValue(descriptor.value, activeObjects));
  }

  return `[${serializedItems.join(",")}]`;
}

function serializeRecord(value: object, activeObjects: WeakSet<object>): string {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new CanonicalJsonError("INVALID_OBJECT", "JSON objects cannot have symbol properties");
  }

  const keys = Object.getOwnPropertyNames(value).sort(compareUtf16CodeUnits);
  const serializedProperties: string[] = [];

  for (const key of keys) {
    assertValidUnicode(key);

    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new CanonicalJsonError(
        "INVALID_OBJECT",
        "JSON objects may contain only enumerable data properties",
      );
    }

    serializedProperties.push(
      `${serializeString(key)}:${serializeValue(descriptor.value, activeObjects)}`,
    );
  }

  return `{${serializedProperties.join(",")}}`;
}

function compareUtf16CodeUnits(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function assertValidUnicode(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (index + 1 >= value.length || nextCodeUnit < 0xdc00 || nextCodeUnit > 0xdfff) {
        throw new CanonicalJsonError(
          "INVALID_UNICODE",
          "JSON strings cannot contain lone UTF-16 surrogates",
        );
      }

      index += 1;
      continue;
    }

    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new CanonicalJsonError(
        "INVALID_UNICODE",
        "JSON strings cannot contain lone UTF-16 surrogates",
      );
    }
  }
}
