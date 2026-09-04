import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RazorpayClient, reconcileRazorpayPayment } from "../packages/razorpay/src/index";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

async function main(): Promise<void> {
  const [successOrderId, successPaymentId, failureOrderId, failurePaymentId, ...unexpected] =
    process.argv.slice(2);
  if (
    successOrderId === undefined ||
    successPaymentId === undefined ||
    failureOrderId === undefined ||
    failurePaymentId === undefined ||
    unexpected.length > 0
  ) {
    throw new Error(
      "Usage: pnpm exec tsx scripts/verify-phase-07-live.ts <success-order-id> <success-payment-id> <failure-order-id> <failure-payment-id>",
    );
  }

  const credentials = await readSignalWorksCredentials();
  const client = new RazorpayClient(credentials);
  const evidence = [
    {
      expectedAmount: 29_900,
      expectedOutcome: "CAPTURED_PAID",
      orderId: successOrderId,
      paymentId: successPaymentId,
      scenario: "success",
    },
    {
      expectedAmount: 44_900,
      expectedOutcome: "FAILED",
      orderId: failureOrderId,
      paymentId: failurePaymentId,
      scenario: "failure",
    },
  ] as const;

  const results = [];
  for (const item of evidence) {
    const [order, payment] = await Promise.all([
      client.fetchOrder(item.orderId),
      client.fetchPayment(item.paymentId),
    ]);
    const reconciliation = reconcileRazorpayPayment({
      expectedAmount: item.expectedAmount,
      expectedCurrency: "INR",
      expectedOrderId: item.orderId,
      order,
      payment,
    });
    if (reconciliation.outcome !== item.expectedOutcome) {
      throw new Error(`${item.scenario} reconciliation did not match the expected outcome`);
    }
    results.push({
      fulfilment_eligible: reconciliation.fulfilmentEligible,
      order_created_at: new Date(order.created_at * 1_000).toISOString(),
      order_id: order.id,
      order_status: order.status,
      outcome: reconciliation.outcome,
      payment_created_at: new Date(payment.created_at * 1_000).toISOString(),
      payment_id: payment.id,
      payment_status: payment.status,
      reasons: reconciliation.reasons,
      scenario: item.scenario,
    });
  }

  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
}

async function readSignalWorksCredentials(): Promise<{
  readonly keyId: string;
  readonly keySecret: string;
}> {
  const envText = await readFile(
    resolve(repositoryRoot, "apps/merchant-signalworks/.dev.vars"),
    "utf8",
  );
  const values = new Map<string, string>();
  for (const line of envText.split(/\r?\n/u)) {
    const match = /^([A-Z0-9_]+)=(.*)$/u.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      values.set(match[1], match[2].replace(/^["']|["']$/gu, ""));
    }
  }
  const keyId = values.get("RAZORPAY_KEY_ID");
  const keySecret = values.get("RAZORPAY_KEY_SECRET");
  if (keyId === undefined || keySecret === undefined) {
    throw new Error("Razorpay Test Mode credentials are missing from SignalWorks .dev.vars");
  }
  return { keyId, keySecret };
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Live Razorpay verification failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
