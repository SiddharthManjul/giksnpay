import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CanonicalJsonError, canonicalizeJson, canonicalizeJsonBytes } from "./canonical-json";

describe("RFC 8785 canonical JSON", () => {
  it("matches the RFC 8785 serialization example", () => {
    const input = {
      numbers: [Number("333333333.33333329"), 1e30, 4.5, 2e-3, 1e-27],
      string: '€$\u000f\nA\'B"\\\\"/',
      literals: [null, true, false],
    };
    const expected = String.raw`{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\u000f\nA'B\"\\\\\"/"}`;

    expect(canonicalizeJson(input)).toBe(expected);
  });

  it("sorts object keys by their raw UTF-16 code units", () => {
    const input = {
      דּ: "Hebrew Letter Dalet With Dagesh",
      "1": "One",
      "😀": "Emoji: Grinning Face",
      "€": "Euro Sign",
      "\r": "Carriage Return",
      ö: "Latin Small Letter O With Diaeresis",
      "\u0080": "Control",
    };

    const canonical = canonicalizeJson(input);
    const expectedOrder = ["\r", "1", "\u0080", "ö", "€", "😀", "דּ"];
    const keyPositions = expectedOrder.map((key) => canonical.indexOf(`${JSON.stringify(key)}:`));

    expect(keyPositions.every((position) => position >= 0)).toBe(true);
    expect(keyPositions).toEqual([...keyPositions].sort((left, right) => left - right));
  });

  it("uses ECMAScript number serialization and normalizes negative zero", () => {
    expect(canonicalizeJson([-0, 1e30, 4.5, 0.002, 1e-27])).toBe("[0,1e+30,4.5,0.002,1e-27]");
  });

  it("emits the exact UTF-8 bytes of the canonical string", () => {
    const value = { currency: "INR", label: "₹299", amountSubunits: 29_900 };
    const canonical = canonicalizeJson(value);

    expect(new TextDecoder().decode(canonicalizeJsonBytes(value))).toBe(canonical);
    expect(canonicalizeJsonBytes(value)).toEqual(new TextEncoder().encode(canonical));
  });

  it("is independent of object insertion order and detects value mutations", () => {
    const first = { z: 3, a: 1, middle: { second: true, first: false } };
    const reordered = { middle: { first: false, second: true }, a: 1, z: 3 };
    const mutated = { middle: { first: false, second: true }, a: 2, z: 3 };

    expect(canonicalizeJsonBytes(first)).toEqual(canonicalizeJsonBytes(reordered));
    expect(canonicalizeJsonBytes(first)).not.toEqual(canonicalizeJsonBytes(mutated));
  });
});

describe("fail-closed input validation", () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects invalid number %j",
    (value) => {
      expect(() => canonicalizeJson(value)).toThrow(CanonicalJsonError);
    },
  );

  it.each([undefined, 1n, Symbol("value"), () => true])("rejects non-JSON value %#", (value) => {
    expect(() => canonicalizeJson(value)).toThrow(CanonicalJsonError);
  });

  it("rejects non-plain objects", () => {
    class RecordValue {
      value = 1;
    }

    expect(() => canonicalizeJson(new Date(0))).toThrow(CanonicalJsonError);
    expect(() => canonicalizeJson(new Map())).toThrow(CanonicalJsonError);
    expect(() => canonicalizeJson(new RecordValue())).toThrow(CanonicalJsonError);
  });

  it("rejects lone UTF-16 surrogates in values and keys", () => {
    const invalidKey = "\ud800";

    expect(() => canonicalizeJson("\ud800")).toThrow(/lone UTF-16 surrogate/);
    expect(() => canonicalizeJson("\udfff")).toThrow(/lone UTF-16 surrogate/);
    expect(() => canonicalizeJson({ [invalidKey]: true })).toThrow(/lone UTF-16 surrogate/);
  });

  it("rejects sparse arrays and arrays with extra properties", () => {
    const sparse = new Array<unknown>(2);
    sparse[1] = true;

    const extended: unknown[] & { label?: string } = [true];
    extended.label = "not JSON array data";

    expect(() => canonicalizeJson(sparse)).toThrow(/dense/);
    expect(() => canonicalizeJson(extended)).toThrow(/extra properties/);
  });

  it("rejects accessors without invoking them", () => {
    let invoked = false;
    const value: Record<string, unknown> = {};
    Object.defineProperty(value, "secret", {
      enumerable: true,
      get() {
        invoked = true;
        return "exposed";
      },
    });

    expect(() => canonicalizeJson(value)).toThrow(/data properties/);
    expect(invoked).toBe(false);
  });

  it("rejects non-enumerable and symbol properties", () => {
    const hidden = { visible: true };
    Object.defineProperty(hidden, "hidden", { value: true, enumerable: false });
    const symbolic = { visible: true, [Symbol("hidden")]: true };

    expect(() => canonicalizeJson(hidden)).toThrow(/enumerable data properties/);
    expect(() => canonicalizeJson(symbolic)).toThrow(/symbol properties/);
  });

  it("rejects cycles but permits repeated non-cyclic references", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const shared = { approved: true };

    expect(() => canonicalizeJson(cyclic)).toThrow(/cycles/);
    expect(canonicalizeJson({ first: shared, second: shared })).toBe(
      '{"first":{"approved":true},"second":{"approved":true}}',
    );
  });
});

describe("canonicalization properties", () => {
  const asciiKey = fc.stringMatching(/^[A-Za-z0-9_]{0,12}$/);
  const asciiString = fc.stringMatching(/^[ -~]{0,24}$/);
  const jsonScalar = fc.oneof(
    fc.constant(null),
    fc.boolean(),
    fc.integer(),
    fc.double({ noNaN: true, noDefaultInfinity: true }),
    asciiString,
  );
  const jsonRecord = fc.dictionary(asciiKey, jsonScalar, { maxKeys: 12 });

  it("keeps output stable when insertion order changes", () => {
    fc.assert(
      fc.property(jsonRecord, (record) => {
        const reversed = Object.fromEntries(Object.entries(record).reverse());
        expect(canonicalizeJson(reversed)).toBe(canonicalizeJson(record));
      }),
    );
  });

  it("is idempotent after parsing its own output", () => {
    fc.assert(
      fc.property(jsonRecord, (record) => {
        const canonical = canonicalizeJson(record);
        expect(canonicalizeJson(JSON.parse(canonical))).toBe(canonical);
      }),
    );
  });
});
