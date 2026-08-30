import { describe, expect, it } from "vitest";
import { isPublicIpAddress, verifyMerchant } from "./merchant-verification";

describe("merchant network verification boundary", () => {
  it("distinguishes public addresses from private, link-local, loopback, and documentation ranges", () => {
    expect(isPublicIpAddress("8.8.8.8")).toBe(true);
    expect(isPublicIpAddress("2606:4700:4700::1111")).toBe(true);
    for (const address of [
      "10.0.0.1",
      "127.0.0.1",
      "169.254.1.1",
      "172.16.0.1",
      "192.168.0.1",
      "203.0.113.10",
      "::1",
      "0:0:0:0:0:0:0:1",
      "::ffff:127.0.0.1",
      "fd00::1",
      "fe80::1",
      "2001:db8::1",
      "2::not-hex",
    ]) {
      expect(isPublicIpAddress(address), address).toBe(false);
    }
  });

  it("fails closed before fetching when DNS returns a private destination", async () => {
    let fetched = false;
    await expect(
      verifyMerchant(
        { domain: "merchant-demo.example.com", merchantId: "merchant_signalworks" },
        {
          fetchPublication: async () => {
            fetched = true;
            throw new Error("must not fetch");
          },
          resolveHostname: async () => ["10.0.0.5"],
        },
      ),
    ).resolves.toMatchObject({ reason: "PRIVATE_NETWORK", valid: false });
    expect(fetched).toBe(false);
  });

  it("returns a stable redirect reason without following the manifest location", async () => {
    await expect(
      verifyMerchant(
        { domain: "merchant-demo.example.com", merchantId: "merchant_signalworks" },
        {
          fetchPublication: async (url) => ({
            body: {},
            location: "https://evil.example/.well-known/mindpay.json",
            status: 302,
            url,
          }),
          resolveHostname: async () => ["8.8.8.8"],
        },
      ),
    ).resolves.toMatchObject({ reason: "MANIFEST_REDIRECTED", valid: false });
  });

  it("rejects oversized publications before parsing their body", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response("{}", {
          headers: { "content-length": "1000001", "content-type": "application/json" },
          status: 200,
        }),
      )) as typeof fetch;
    try {
      await expect(
        verifyMerchant(
          { domain: "merchant-demo.example.com", merchantId: "merchant_signalworks" },
          { resolveHostname: async () => ["8.8.8.8"] },
        ),
      ).resolves.toMatchObject({ reason: "NETWORK_ERROR", valid: false });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
