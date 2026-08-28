import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  BinaryEncodingError,
  base64UrlToBytes,
  bytesToBase64Url,
  bytesToHex,
  hexToBytes,
  timingSafeEqual,
  toBytes,
} from "./bytes";

describe("byte encoding", () => {
  it("encodes strings as UTF-8", () => {
    expect(toBytes("₹299")).toEqual(new TextEncoder().encode("₹299"));
  });

  it("defensively copies byte inputs", () => {
    const source = new Uint8Array([1, 2, 3]);
    const copied = toBytes(source);
    source[0] = 9;

    expect(copied).toEqual(new Uint8Array([1, 2, 3]));
  });

  it.each(["0", "abc", "00xz", "₹0"])("rejects malformed hexadecimal %j", (value) => {
    expect(() => hexToBytes(value)).toThrow(BinaryEncodingError);
  });

  it("accepts uppercase hexadecimal and emits canonical lowercase", () => {
    expect(bytesToHex(hexToBytes("00A1FF"))).toBe("00a1ff");
  });

  it("round-trips arbitrary byte sequences", () => {
    fc.assert(
      fc.property(fc.uint8Array(), (value) => {
        expect(hexToBytes(bytesToHex(value))).toEqual(value);
      }),
    );
  });

  it("round-trips arbitrary bytes as unpadded base64url", () => {
    fc.assert(
      fc.property(fc.uint8Array(), (value) => {
        const encoded = bytesToBase64Url(value);

        expect(encoded).not.toMatch(/[+/=]/u);
        expect(base64UrlToBytes(encoded)).toEqual(value);
      }),
    );
  });

  it.each(["a", "AA=", "AA+", "AB"])("rejects malformed base64url %j", (value) => {
    expect(() => base64UrlToBytes(value)).toThrow(BinaryEncodingError);
  });
});

describe("timing-safe byte comparison", () => {
  it("accepts equal bytes and rejects mutations at either edge", () => {
    const expected = new Uint8Array([1, 2, 3, 4]);

    expect(timingSafeEqual(expected, new Uint8Array([1, 2, 3, 4]))).toBe(true);
    expect(timingSafeEqual(expected, new Uint8Array([0, 2, 3, 4]))).toBe(false);
    expect(timingSafeEqual(expected, new Uint8Array([1, 2, 3, 5]))).toBe(false);
  });

  it("rejects unequal lengths and handles empty inputs", () => {
    expect(timingSafeEqual(new Uint8Array([1]), new Uint8Array([1, 0]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array(), new Uint8Array([0]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array(), new Uint8Array())).toBe(true);
  });
});
