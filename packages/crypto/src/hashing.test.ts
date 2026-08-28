import { describe, expect, it } from "vitest";
import { hexToBytes } from "./bytes";
import {
  SHA_256_BYTE_LENGTH,
  SHA_256_HEX_LENGTH,
  hmacSha256,
  hmacSha256Hex,
  sha256,
  sha256CanonicalJsonHex,
  sha256Hex,
  verifyHmacSha256,
  verifyHmacSha256Hex,
} from "./hashing";

describe("SHA-256", () => {
  it.each([
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    [
      "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    ],
  ])("matches the NIST vector for %j", async (message, expected) => {
    expect(await sha256Hex(message)).toBe(expected);
  });

  it("returns a fresh 32-byte digest", async () => {
    const first = await sha256("mindpay");
    const second = await sha256("mindpay");

    expect(first).toHaveLength(SHA_256_BYTE_LENGTH);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(await sha256Hex("mindpay")).toHaveLength(SHA_256_HEX_LENGTH);
  });

  it("hashes canonical JSON independently of insertion order", async () => {
    const first = { amountSubunits: 29_900, currency: "INR", merchant: { id: "sw", live: true } };
    const reordered = {
      merchant: { live: true, id: "sw" },
      currency: "INR",
      amountSubunits: 29_900,
    };
    const mutated = { merchant: { live: true, id: "sw" }, currency: "INR", amountSubunits: 29_901 };

    expect(await sha256CanonicalJsonHex(first)).toBe(await sha256CanonicalJsonHex(reordered));
    expect(await sha256CanonicalJsonHex(first)).not.toBe(await sha256CanonicalJsonHex(mutated));
  });
});

describe("HMAC-SHA256", () => {
  it.each([
    {
      key: new Uint8Array(20).fill(0x0b),
      message: "Hi There",
      expected: "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
    },
    {
      key: "Jefe",
      message: "what do ya want for nothing?",
      expected: "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    },
  ])("matches RFC 4231 test vectors", async ({ key, message, expected }) => {
    expect(await hmacSha256Hex(key, message)).toBe(expected);
  });

  it("returns a 32-byte MAC", async () => {
    expect(await hmacSha256("secret", "message")).toHaveLength(SHA_256_BYTE_LENGTH);
  });

  it("verifies valid bytes and rejects one-byte message or signature mutations", async () => {
    const signature = await hmacSha256("secret", "order_1|pay_1");
    const mutatedSignature = Uint8Array.from(signature);
    mutatedSignature[0] = (mutatedSignature[0] ?? 0) ^ 1;

    expect(await verifyHmacSha256("secret", "order_1|pay_1", signature)).toBe(true);
    expect(await verifyHmacSha256("secret", "order_1|pay_2", signature)).toBe(false);
    expect(await verifyHmacSha256("secret", "order_1|pay_1", mutatedSignature)).toBe(false);
  });

  it("verifies hexadecimal without comparing strings", async () => {
    const signature = await hmacSha256Hex("secret", "raw webhook body");

    expect(await verifyHmacSha256Hex("secret", "raw webhook body", signature)).toBe(true);
    expect(await verifyHmacSha256Hex("secret", "raw webhook body", signature.toUpperCase())).toBe(
      true,
    );
    expect(await verifyHmacSha256Hex("secret", "changed body", signature)).toBe(false);
  });

  it("fails closed for malformed and unequal-length signatures", async () => {
    const signature = await hmacSha256Hex("secret", "message");
    const shortSignature = hexToBytes(signature.slice(0, -2));

    expect(await verifyHmacSha256("secret", "message", shortSignature)).toBe(false);
    expect(await verifyHmacSha256Hex("secret", "message", signature.slice(0, -2))).toBe(false);
    expect(await verifyHmacSha256Hex("secret", "message", "not-hex")).toBe(false);
    expect(await verifyHmacSha256Hex("secret", "message", "f")).toBe(false);
  });
});
