import { describe, expect, it, vi } from "vitest";
import { RazorpayClient, RazorpayClientError } from "./client";

const ORDER = {
  amount: 29_900,
  amount_due: 29_900,
  amount_paid: 0,
  attempts: 0,
  created_at: 1_700_000_000,
  currency: "INR",
  entity: "order",
  id: "order_MindPay0001",
  notes: { mindpay_transaction_id: "ctx_test" },
  receipt: "mp_test_1",
  status: "created",
} as const;

describe("Worker-compatible Razorpay REST client", () => {
  it("creates a typed Test Mode order with server-side Basic auth", async () => {
    const providerFetch = vi.fn<typeof fetch>(async (_input, init) => {
      expect(new Headers(init?.headers).get("authorization")).toMatch(/^Basic /u);
      expect(JSON.parse(String(init?.body))).toEqual({
        amount: 29_900,
        currency: "INR",
        notes: { mindpay_transaction_id: "ctx_test" },
        receipt: "mp_test_1",
      });
      return Response.json(ORDER);
    });
    const client = createClient(providerFetch);

    await expect(
      client.createOrder({
        amount: 29_900,
        currency: "INR",
        notes: { mindpay_transaction_id: "ctx_test" },
        receipt: "mp_test_1",
      }),
    ).resolves.toMatchObject({ id: ORDER.id, status: "created" });
    expect(providerFetch).toHaveBeenCalledTimes(1);
  });

  it("retries safe GET failures but never retries an ambiguous POST", async () => {
    const getFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ error: { code: "SERVER_ERROR" } }, { status: 502 }))
      .mockResolvedValueOnce(Response.json(ORDER));
    await expect(createClient(getFetch).fetchOrder(ORDER.id)).resolves.toMatchObject({
      id: ORDER.id,
    });
    expect(getFetch).toHaveBeenCalledTimes(2);

    const postFetch = vi.fn<typeof fetch>(async () => {
      throw new TypeError("connection dropped");
    });
    await expect(
      createClient(postFetch).createOrder({
        amount: 29_900,
        currency: "INR",
        notes: {},
        receipt: "mp_ambiguous_1",
      }),
    ).rejects.toMatchObject({ ambiguous: true, kind: "NETWORK", retryable: true });
    expect(postFetch).toHaveBeenCalledTimes(1);
  });

  it("fails closed on malformed responses and redacts secrets from provider errors", async () => {
    await expect(
      createClient(
        vi.fn<typeof fetch>(async () => Response.json({ id: "not-an-order" })),
      ).fetchOrder(ORDER.id),
    ).rejects.toMatchObject({ kind: "MALFORMED_RESPONSE" });

    const secret = "test_secret_1234567890";
    const client = new RazorpayClient({
      fetch: vi.fn<typeof fetch>(async () =>
        Response.json(
          { error: { code: "BAD_REQUEST_ERROR", description: `bad ${secret}` } },
          { status: 400 },
        ),
      ),
      keyId: "rzp_test_MindPay01",
      keySecret: secret,
    });
    const error = await client
      .createOrder({ amount: 29_900, currency: "INR", notes: {}, receipt: "mp_error_1" })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RazorpayClientError);
    expect(String(error)).not.toContain(secret);
    expect(String(error)).toContain("[REDACTED]");
  });
});

function createClient(providerFetch: typeof fetch): RazorpayClient {
  return new RazorpayClient({
    fetch: providerFetch,
    keyId: "rzp_test_MindPay01",
    keySecret: "test_secret_1234567890",
    retryDelay: () => Promise.resolve(),
    timeoutMs: 1_000,
  });
}
