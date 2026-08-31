import { z } from "zod";

const providerId = (prefix: "order" | "pay" | "rfnd") =>
  z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9]{8,64}$`, "u"));

export const razorpayOrderIdSchema = providerId("order");
export const razorpayPaymentIdSchema = providerId("pay");
export const razorpayRefundIdSchema = providerId("rfnd");
export const razorpayCurrencySchema = z.literal("INR");
export const razorpayOrderStatusSchema = z.enum(["created", "attempted", "paid"]);
export const razorpayPaymentStatusSchema = z.enum([
  "created",
  "authorized",
  "captured",
  "refunded",
  "failed",
]);
export const razorpayRefundStatusSchema = z.enum(["pending", "processed", "failed"]);

const notesSchema = z.record(z.string().min(1).max(256), z.string().max(256));

export const createRazorpayOrderInputSchema = z
  .object({
    amount: z.number().int().min(100).max(Number.MAX_SAFE_INTEGER),
    currency: razorpayCurrencySchema,
    notes: notesSchema.refine((notes) => Object.keys(notes).length <= 15),
    receipt: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/u),
  })
  .strict()
  .readonly();

export const razorpayOrderSchema = z
  .object({
    amount: z.number().int().nonnegative(),
    amount_due: z.number().int().nonnegative(),
    amount_paid: z.number().int().nonnegative(),
    attempts: z.number().int().nonnegative(),
    created_at: z.number().int().nonnegative(),
    currency: razorpayCurrencySchema,
    entity: z.literal("order"),
    id: razorpayOrderIdSchema,
    notes: z.union([notesSchema, z.array(z.never()).length(0)]),
    receipt: z.string().min(1).max(40),
    status: razorpayOrderStatusSchema,
  })
  .passthrough()
  .readonly();

export const razorpayPaymentSchema = z
  .object({
    amount: z.number().int().nonnegative(),
    amount_refunded: z.number().int().nonnegative().default(0),
    captured: z.boolean(),
    created_at: z.number().int().nonnegative(),
    currency: razorpayCurrencySchema,
    entity: z.literal("payment"),
    error_code: z.string().nullable().optional(),
    error_description: z.string().nullable().optional(),
    id: razorpayPaymentIdSchema,
    order_id: razorpayOrderIdSchema,
    status: razorpayPaymentStatusSchema,
  })
  .passthrough()
  .readonly();

export const razorpayRefundSchema = z
  .object({
    amount: z.number().int().positive(),
    created_at: z.number().int().nonnegative(),
    currency: razorpayCurrencySchema,
    entity: z.literal("refund"),
    id: razorpayRefundIdSchema,
    payment_id: razorpayPaymentIdSchema,
    status: razorpayRefundStatusSchema,
  })
  .passthrough()
  .readonly();

const providerErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string().optional(),
        description: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough();

export type CreateRazorpayOrderInput = z.infer<typeof createRazorpayOrderInputSchema>;
export type RazorpayOrder = z.infer<typeof razorpayOrderSchema>;
export type RazorpayPayment = z.infer<typeof razorpayPaymentSchema>;
export type RazorpayRefund = z.infer<typeof razorpayRefundSchema>;

export interface RazorpayClientOptions {
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  readonly keyId: string;
  readonly keySecret: string;
  readonly maxGetRetries?: number;
  readonly retryDelay?: (attempt: number) => Promise<void>;
  readonly timeoutMs?: number;
}

export type RazorpayClientErrorKind =
  | "AUTHENTICATION"
  | "HTTP"
  | "MALFORMED_RESPONSE"
  | "NETWORK"
  | "TIMEOUT";

export class RazorpayClientError extends Error {
  readonly ambiguous: boolean;
  readonly kind: RazorpayClientErrorKind;
  readonly providerCode: string | undefined;
  readonly retryable: boolean;
  readonly status: number | undefined;

  constructor(
    message: string,
    details: {
      ambiguous?: boolean;
      kind: RazorpayClientErrorKind;
      providerCode?: string;
      retryable?: boolean;
      status?: number;
    },
  ) {
    super(message);
    this.name = "RazorpayClientError";
    this.ambiguous = details.ambiguous ?? false;
    this.kind = details.kind;
    this.providerCode = details.providerCode;
    this.retryable = details.retryable ?? false;
    this.status = details.status;
  }
}

export class RazorpayClient {
  readonly #authorization: string;
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #keySecret: string;
  readonly #maxGetRetries: number;
  readonly #retryDelay: (attempt: number) => Promise<void>;
  readonly #timeoutMs: number;

  constructor(options: RazorpayClientOptions) {
    const keyId = z
      .string()
      .regex(/^rzp_test_[A-Za-z0-9]{8,64}$/u)
      .parse(options.keyId);
    const keySecret = z
      .string()
      .regex(/^[\x21-\x7e]{16,128}$/u)
      .parse(options.keySecret);
    const baseUrl = new URL(options.baseUrl ?? "https://api.razorpay.com/v1/");
    if (baseUrl.protocol !== "https:" || baseUrl.username !== "" || baseUrl.password !== "") {
      throw new TypeError("Razorpay base URL must be credential-free HTTPS");
    }
    this.#baseUrl = baseUrl.toString().replace(/\/$/u, "");
    this.#fetch = options.fetch ?? fetch;
    this.#keySecret = keySecret;
    this.#authorization = `Basic ${btoa(`${keyId}:${keySecret}`)}`;
    this.#maxGetRetries = z
      .number()
      .int()
      .min(0)
      .max(4)
      .parse(options.maxGetRetries ?? 2);
    this.#timeoutMs = z
      .number()
      .int()
      .min(50)
      .max(60_000)
      .parse(options.timeoutMs ?? 8_000);
    this.#retryDelay = options.retryDelay ?? (() => Promise.resolve());
  }

  createOrder(input: CreateRazorpayOrderInput): Promise<RazorpayOrder> {
    return this.#request(
      "POST",
      "/orders",
      createRazorpayOrderInputSchema.parse(input),
      razorpayOrderSchema,
    );
  }

  fetchOrder(orderId: string): Promise<RazorpayOrder> {
    return this.#request(
      "GET",
      `/orders/${razorpayOrderIdSchema.parse(orderId)}`,
      undefined,
      razorpayOrderSchema,
    );
  }

  fetchPayment(paymentId: string): Promise<RazorpayPayment> {
    return this.#request(
      "GET",
      `/payments/${razorpayPaymentIdSchema.parse(paymentId)}`,
      undefined,
      razorpayPaymentSchema,
    );
  }

  createRefund(paymentId: string, amount: number): Promise<RazorpayRefund> {
    return this.#request(
      "POST",
      `/payments/${razorpayPaymentIdSchema.parse(paymentId)}/refund`,
      { amount: z.number().int().positive().parse(amount) },
      razorpayRefundSchema,
    );
  }

  fetchRefund(refundId: string): Promise<RazorpayRefund> {
    return this.#request(
      "GET",
      `/refunds/${razorpayRefundIdSchema.parse(refundId)}`,
      undefined,
      razorpayRefundSchema,
    );
  }

  async #request<T>(
    method: "GET" | "POST",
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const maximumAttempts = method === "GET" ? this.#maxGetRetries + 1 : 1;
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
      try {
        const response = await this.#fetch(`${this.#baseUrl}${path}`, {
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          headers: {
            Accept: "application/json",
            Authorization: this.#authorization,
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          },
          method,
          signal: controller.signal,
        });
        const responseBody = await parseJson(response);
        if (!response.ok) {
          const parsedError = providerErrorSchema.safeParse(responseBody);
          const providerCode = parsedError.success ? parsedError.data.error.code : undefined;
          const description = parsedError.success
            ? parsedError.data.error.description
            : "Razorpay rejected the request";
          const retryable =
            response.status === 408 || response.status === 429 || response.status >= 500;
          if (method === "GET" && retryable && attempt < maximumAttempts) {
            await this.#retryDelay(attempt);
            continue;
          }
          throw new RazorpayClientError(
            this.#redact(description ?? "Razorpay rejected the request"),
            {
              ambiguous: method === "POST" && retryable,
              kind: response.status === 401 ? "AUTHENTICATION" : "HTTP",
              ...(providerCode === undefined ? {} : { providerCode }),
              retryable,
              status: response.status,
            },
          );
        }
        const parsed = schema.safeParse(responseBody);
        if (!parsed.success) {
          throw new RazorpayClientError("Razorpay returned a malformed response", {
            ambiguous: method === "POST",
            kind: "MALFORMED_RESPONSE",
          });
        }
        return parsed.data;
      } catch (error) {
        if (error instanceof RazorpayClientError) throw error;
        const timedOut = controller.signal.aborted;
        if (method === "GET" && attempt < maximumAttempts) {
          await this.#retryDelay(attempt);
          continue;
        }
        throw new RazorpayClientError(
          timedOut ? "Razorpay request timed out" : "Razorpay request failed",
          {
            ambiguous: method === "POST",
            kind: timedOut ? "TIMEOUT" : "NETWORK",
            retryable: true,
          },
        );
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new RazorpayClientError("Razorpay request failed", {
      kind: "NETWORK",
      retryable: true,
    });
  }

  #redact(message: string): string {
    return message.replaceAll(this.#keySecret, "[REDACTED]").slice(0, 500);
  }
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
