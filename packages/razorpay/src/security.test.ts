import { describe, expect, it } from "vitest";
import {
  createRazorpayHmacHex,
  timingSafeHexEqual,
  verifyRazorpayCheckoutSignature,
  verifyRazorpayWebhookSignature,
} from "./security";

const SECRET = "test_secret_1234567890";

describe("Razorpay HMAC boundaries", () => {
  it("verifies callback signatures against the stored order ID only", async () => {
    const paymentId = "pay_MindPay0001";
    const storedOrderId = "order_MindPay0001";
    const signature = await createRazorpayHmacHex(SECRET, `${storedOrderId}|${paymentId}`);
    await expect(
      verifyRazorpayCheckoutSignature({ keySecret: SECRET, paymentId, signature, storedOrderId }),
    ).resolves.toBe(true);
    await expect(
      verifyRazorpayCheckoutSignature({
        keySecret: SECRET,
        paymentId,
        signature,
        storedOrderId: "order_Attacker0001",
      }),
    ).resolves.toBe(false);
  });

  it("verifies exact raw webhook bytes and tolerates an old rotation secret", async () => {
    const rawBody = new TextEncoder().encode('{"event":"order.paid","amount":29900}');
    const signature = await createRazorpayHmacHex(SECRET, rawBody);
    await expect(
      verifyRazorpayWebhookSignature({
        rawBody,
        signature,
        webhookSecrets: ["old_webhook_secret_1234", SECRET],
      }),
    ).resolves.toBe(true);
    await expect(
      verifyRazorpayWebhookSignature({
        rawBody: new TextEncoder().encode('{"amount":29900,"event":"order.paid"}'),
        signature,
        webhookSecrets: [SECRET],
      }),
    ).resolves.toBe(false);
    expect(timingSafeHexEqual(signature, `${signature.slice(0, -1)}0`)).toBe(false);
    expect(timingSafeHexEqual(signature, "bad")).toBe(false);
  });
});
