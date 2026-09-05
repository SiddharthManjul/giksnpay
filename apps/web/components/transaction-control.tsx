"use client";

import {
  authorizationApprovalRequestSchema,
  authorizationChallengeRequestSchema,
  merchantPaymentOrderResponseSchema,
  passkeyCredentialsResponseSchema,
  razorpayCheckoutCallbackResponseSchema,
  razorpayCheckoutCallbackSchema,
  signedEvidenceBundleSchema,
  transactionActionResponseSchema,
  transactionAuditEventsResponseSchema,
  transactionChallengeResponseSchema,
  transactionDetailResponseSchema,
  type MerchantPaymentOrderResponse,
} from "@mindpay/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CircleDot,
  ExternalLink,
  Fingerprint,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { API_ORIGIN, apiRequest, idempotencyKey } from "@/lib/api";
import { formatDate, formatInr, humanize, shortId } from "@/lib/format";
import { useWorkspaceSession } from "@/lib/workspace";
import { getPasskeyAssertion } from "@/lib/webauthn";
import { Alert, Loading, Panel, StatusBadge } from "./ui";

const decisionEvidenceSchema = z
  .object({
    checkout: z
      .object({ checkout_session_id: z.string(), total_subunits: z.number().int() })
      .passthrough(),
    checkoutHash: z.string(),
    checkoutSignatureVerified: z.boolean(),
    offerSignatureVerified: z.boolean(),
    policy: z
      .object({
        decision: z.enum(["ALLOW", "APPROVAL_REQUIRED", "BLOCK"]),
        reasons: z.array(
          z
            .object({
              code: z.string(),
              evidence: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])),
              severity: z.string(),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
    risk: z
      .object({
        outcome: z.enum(["ALLOW", "REVIEW", "BLOCK"]),
        reasons: z.array(
          z
            .object({
              code: z.string(),
              evidence: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])),
              severity: z.string(),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
  })
  .passthrough();

const paymentActiveStates = new Set([
  "CALLBACK_VERIFIED",
  "PAYMENT_PENDING",
  "PAYMENT_RECONCILING",
]);
const evidenceStates = new Set([
  "BLOCKED",
  "CANCELLED",
  "EVIDENCE_READY",
  "EXPIRED",
  "FULFILLED",
  "FULFILMENT_FAILED",
  "PAYMENT_FAILED",
  "REFUNDED",
]);
const rail = [
  "POLICY_REVIEW",
  "APPROVAL_REQUIRED",
  "BUDGET_RESERVED",
  "PAYMENT_PENDING",
  "PAYMENT_CAPTURED",
  "ENTITLEMENT_ISSUED",
  "FULFILLED",
  "EVIDENCE_READY",
] as const;

interface RazorpayInstance {
  on(event: "payment.failed", listener: (response: unknown) => void): void;
  open(): void;
}

interface RazorpayOptions {
  amount: number;
  currency: "INR";
  description: string;
  handler: (response: unknown) => void;
  key: string;
  modal: { ondismiss: () => void };
  name: string;
  order_id: string;
  retry: { enabled: false };
  theme: { color: string };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

export function TransactionControl({ transactionId }: Readonly<{ transactionId: string }>) {
  const client = useQueryClient();
  const { organizationId } = useWorkspaceSession();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createdOrder, setCreatedOrder] = useState<MerchantPaymentOrderResponse | null>(null);
  const transactionKey = useMemo(
    () => ["transaction", organizationId, transactionId] as const,
    [organizationId, transactionId],
  );
  const transaction = useQuery({
    enabled: organizationId !== null,
    queryFn: () =>
      apiRequest(
        `/api/v1/transactions/${encodeURIComponent(transactionId)}`,
        transactionDetailResponseSchema,
        {},
        organizationId,
      ),
    queryKey: transactionKey,
    refetchInterval: (query) => (isSettled(query.state.data?.state) ? false : 4_000),
  });
  const audits = useQuery({
    enabled: organizationId !== null,
    queryFn: () =>
      apiRequest(
        `/api/v1/transactions/${encodeURIComponent(transactionId)}/events`,
        transactionAuditEventsResponseSchema,
        {},
        organizationId,
      ),
    queryKey: ["transaction-audit", organizationId, transactionId],
    refetchInterval:
      transaction.data === undefined || isSettled(transaction.data.state) ? false : 4_000,
  });
  const passkeys = useQuery({
    enabled: transaction.data?.state === "APPROVAL_REQUIRED",
    queryFn: () => apiRequest("/api/v1/passkeys", passkeyCredentialsResponseSchema),
    queryKey: ["passkeys"],
  });
  const storedOrder = useQuery({
    enabled: transaction.data !== undefined && paymentActiveStates.has(transaction.data.state),
    queryFn: () =>
      apiRequest(
        `/api/v1/transactions/${encodeURIComponent(transactionId)}/payment-order`,
        merchantPaymentOrderResponseSchema,
        {},
        organizationId,
      ),
    queryKey: ["payment-order", organizationId, transactionId],
    retry: false,
  });
  const evidence = useQuery({
    enabled: transaction.data !== undefined && evidenceStates.has(transaction.data.state),
    queryFn: () =>
      apiRequest(
        `/api/v1/transactions/${encodeURIComponent(transactionId)}/evidence`,
        signedEvidenceBundleSchema,
        {},
        organizationId,
      ),
    queryKey: ["transaction-evidence", organizationId, transactionId],
    retry: 2,
  });

  async function refreshCanonical() {
    await Promise.all([
      client.invalidateQueries({ queryKey: transactionKey }),
      client.invalidateQueries({ queryKey: ["transaction-audit", organizationId, transactionId] }),
      client.invalidateQueries({
        queryKey: ["transaction-evidence", organizationId, transactionId],
      }),
    ]);
  }

  useEffect(() => {
    if (organizationId === null) return;
    const wsOrigin = API_ORIGIN.replace(/^http/u, "ws");
    const socket = new WebSocket(
      `${wsOrigin}/api/v1/transactions/${encodeURIComponent(transactionId)}/stream?organizationId=${encodeURIComponent(organizationId)}`,
    );
    socket.onmessage = () => {
      void refreshCanonical();
    };
    return () => socket.close();
  }, [organizationId, transactionId]);

  const createCheckout = useMutation({
    mutationFn: () =>
      apiRequest(
        `/api/v1/transactions/${encodeURIComponent(transactionId)}/checkout`,
        merchantPaymentOrderResponseSchema,
        { body: "{}", headers: { "idempotency-key": idempotencyKey("checkout") }, method: "POST" },
        organizationId,
      ),
    onError: (cause) => setError(messageFrom(cause, "The payment order could not be created.")),
    onSuccess: async (order) => {
      setCreatedOrder(order);
      setError("");
      await refreshCanonical();
      await openRazorpay(order);
    },
  });
  const retry = useMutation({
    mutationFn: () =>
      apiRequest(
        `/api/v1/transactions/${encodeURIComponent(transactionId)}/retry`,
        transactionActionResponseSchema,
        { body: "{}", headers: { "idempotency-key": idempotencyKey("retry") }, method: "POST" },
        organizationId,
      ),
    onError: (cause) => setError(messageFrom(cause, "No retry was available under this mandate.")),
    onSuccess: async () => {
      setError("");
      setNotice("Budget was reserved for one bounded retry.");
      await refreshCanonical();
    },
  });
  const approve = useMutation({
    mutationFn: async () => {
      const credential = passkeys.data?.passkeys[0];
      if (credential === undefined)
        throw new Error("Register a passkey before approving this transaction.");
      const challenge = await apiRequest(
        `/api/v1/transactions/${encodeURIComponent(transactionId)}/challenges`,
        transactionChallengeResponseSchema,
        {
          body: JSON.stringify(
            authorizationChallengeRequestSchema.parse({ credentialId: credential.id }),
          ),
          headers: { "idempotency-key": idempotencyKey("transaction-challenge") },
          method: "POST",
        },
        organizationId,
      );
      const response = await getPasskeyAssertion(challenge.options);
      return apiRequest(
        `/api/v1/transactions/${encodeURIComponent(transactionId)}/approve`,
        transactionActionResponseSchema,
        {
          body: JSON.stringify(
            authorizationApprovalRequestSchema.parse({
              challengeId: challenge.challengeId,
              response,
            }),
          ),
          headers: { "idempotency-key": idempotencyKey("transaction-approval") },
          method: "POST",
        },
        organizationId,
      );
    },
    onError: (cause) => setError(messageFrom(cause, "Passkey approval failed closed.")),
    onSuccess: async () => {
      setError("");
      setNotice("Approval verified. Budget is now reserved under the original mandate.");
      await refreshCanonical();
    },
  });

  async function acceptRazorpayCallback(untrusted: unknown) {
    const callback = razorpayCheckoutCallbackSchema.safeParse(untrusted);
    if (!callback.success) {
      setError("Razorpay returned an invalid callback payload.");
      return;
    }
    try {
      await apiRequest(
        `/api/v1/transactions/${encodeURIComponent(transactionId)}/payment-callback`,
        razorpayCheckoutCallbackResponseSchema,
        {
          body: JSON.stringify(callback.data),
          headers: { "idempotency-key": idempotencyKey("payment-callback") },
          method: "POST",
        },
        organizationId,
      );
      setNotice(
        "Callback signature verified by SignalWorks. Waiting for provider capture evidence.",
      );
      setError("");
      await refreshCanonical();
    } catch (cause) {
      setError(messageFrom(cause, "The merchant rejected the callback proof."));
    }
  }

  async function openRazorpay(order: MerchantPaymentOrderResponse) {
    try {
      await loadRazorpay();
      if (window.Razorpay === undefined) throw new Error("Razorpay Checkout did not initialize.");
      const checkout = new window.Razorpay({
        ...order.checkout,
        handler: (response) => {
          void acceptRazorpayCallback(response);
        },
        modal: {
          ondismiss: () =>
            setNotice(
              "Checkout closed. The reservation remains bounded until it expires or settles.",
            ),
        },
        theme: { color: "#087a4f" },
      });
      checkout.on("payment.failed", () => {
        setError(
          "Razorpay reported a failed attempt. MindPay will expose retry only if the signed mandate permits it.",
        );
        void refreshCanonical();
      });
      checkout.open();
    } catch (cause) {
      setError(messageFrom(cause, "Razorpay Checkout could not be opened."));
    }
  }

  if (transaction.isLoading) return <Loading label="Reading canonical transaction state" />;
  if (transaction.isError || transaction.data === undefined)
    return <Alert tone="error">This transaction was not found in the active workspace.</Alert>;
  const value = transaction.data;
  const decision = decisionEvidenceSchema.safeParse(value.decisionEvidence);
  const order = createdOrder ?? storedOrder.data ?? null;

  return (
    <>
      <div className="page-title">
        <div>
          <h1 className="balance">Transaction control</h1>
          <p className="data">{value.id}</p>
        </div>
        <div className="page-actions">
          <StatusBadge status={value.state} />
        </div>
      </div>
      <div className="metric-strip">
        <Metric label="Amount" value={formatInr(value.amountSubunits)} />
        <Metric label="Merchant" value={shortId(value.merchantId)} />
        <Metric label="Created" value={formatDate(value.createdAt)} />
        <Metric label="Last change" value={formatDate(value.updatedAt)} />
      </div>
      <div className="transaction-bindings">
        <span>
          <strong>Service</strong> {value.service.name} · {value.service.externalId} v
          {value.service.version}
        </span>
        <span className="data">
          <strong>Agent</strong> {shortId(value.agentId)}
        </span>
        <span className="data">
          <strong>Mandate</strong> {shortId(value.mandateId)}
        </span>
        <span>
          <strong>Rail</strong> Razorpay Test Mode
        </span>
      </div>
      <StateRail current={value.state} />
      {error === "" ? null : (
        <div style={{ marginBottom: 18 }}>
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      {notice === "" ? null : (
        <div style={{ marginBottom: 18 }}>
          <Alert tone="success">{notice}</Alert>
        </div>
      )}
      <TransactionAction
        approve={() => approve.mutate()}
        approving={approve.isPending}
        createCheckout={() => createCheckout.mutate()}
        creating={createCheckout.isPending}
        {...(order === null
          ? {}
          : {
              openCheckout: () => {
                void openRazorpay(order);
              },
            })}
        retry={() => retry.mutate()}
        retrying={retry.isPending}
        state={value.state}
      />
      <div className="grid-2" style={{ marginTop: 18 }}>
        <Panel title="Decision register">
          {!decision.success ? (
            <Alert tone="error">
              Stored decision evidence failed the client contract and was not rendered.
            </Alert>
          ) : (
            <div className="stack">
              <DecisionLine
                label="Policy"
                outcome={decision.data.policy.decision}
                reasons={decision.data.policy.reasons}
              />
              <DecisionLine
                label="Risk"
                outcome={decision.data.risk.outcome}
                reasons={decision.data.risk.reasons}
              />
              <div className="proof-strip">
                <span>
                  <ShieldCheck size={14} /> Checkout signature
                </span>
                <StatusBadge
                  status={decision.data.checkoutSignatureVerified ? "VERIFIED" : "FAILED"}
                />
                <span>
                  <ShieldCheck size={14} /> Offer signature
                </span>
                <StatusBadge
                  status={decision.data.offerSignatureVerified ? "VERIFIED" : "FAILED"}
                />
              </div>
              <p className="mono-id">
                Checkout {shortId(decision.data.checkout.checkout_session_id)} · hash{" "}
                {shortId(decision.data.checkoutHash)}
              </p>
            </div>
          )}
        </Panel>
        <Panel title="Signed audit chain">
          {audits.isLoading ? (
            <Loading label="Verifying chain" />
          ) : audits.isError || audits.data === undefined ? (
            <Alert tone="error">The audit chain could not be verified.</Alert>
          ) : (
            <ol className="timeline compact-timeline">
              {audits.data.events.map(({ event, signatureVerified }) => (
                <li key={event.jti}>
                  <span className="timeline-mark">
                    <CircleDot size={12} />
                  </span>
                  <div className="timeline-content">
                    <strong>{humanize(event.event_type)}</strong>
                    <p>
                      {formatDate(event.occurred_at)} · #{event.sequence} ·{" "}
                      {shortId(event.event_hash)}
                    </p>
                    <StatusBadge status={signatureVerified ? "SIGNED" : "FAILED"} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
      {evidence.isLoading ? (
        <div style={{ marginTop: 18 }}>
          <Loading label="Assembling terminal evidence" />
        </div>
      ) : evidence.isError ? (
        <div style={{ marginTop: 18 }}>
          <Alert tone="warning">Terminal state is recorded; evidence assembly is retrying.</Alert>
        </div>
      ) : evidence.data === undefined ? null : (
        <section className="evidence-callout">
          <div>
            <span className="metric-label">Public redacted evidence</span>
            <strong>{evidence.data.bundle.evidence_id}</strong>
            <p>
              Bundle hash {shortId(evidence.data.bundleHash)} · signed by{" "}
              {evidence.data.signature.kid}
            </p>
          </div>
          <Link
            className="button button-secondary"
            href={`/verify/${evidence.data.bundle.evidence_id}`}
          >
            Open verifier <ExternalLink size={14} />
          </Link>
        </section>
      )}
    </>
  );
}

function TransactionAction({
  approve,
  approving,
  createCheckout,
  creating,
  openCheckout,
  retry,
  retrying,
  state,
}: Readonly<{
  approve: () => void;
  approving: boolean;
  createCheckout: () => void;
  creating: boolean;
  openCheckout?: () => void;
  retry: () => void;
  retrying: boolean;
  state: string;
}>) {
  if (state === "APPROVAL_REQUIRED")
    return (
      <section className="action-bar">
        <div>
          <span className="metric-label">Next valid action</span>
          <strong>Review the exact amount and approve with your passkey.</strong>
        </div>
        <button
          className="button button-signal"
          disabled={approving}
          onClick={approve}
          type="button"
        >
          <Fingerprint size={15} />
          {approving ? "Waiting for passkey…" : "Approve exact proposal"}
        </button>
      </section>
    );
  if (state === "BUDGET_RESERVED")
    return (
      <section className="action-bar">
        <div>
          <span className="metric-label">Next valid action</span>
          <strong>Create one merchant-owned Razorpay Test order.</strong>
        </div>
        <button
          className="button button-signal"
          disabled={creating}
          onClick={createCheckout}
          type="button"
        >
          {creating ? "Creating order…" : "Open secure checkout"}
          <ArrowRight size={15} />
        </button>
      </section>
    );
  if (state === "PAYMENT_FAILED")
    return (
      <section className="action-bar">
        <div>
          <span className="metric-label">Recovery</span>
          <strong>Retry only inside the remaining attempt and budget limits.</strong>
        </div>
        <button
          className="button button-secondary"
          disabled={retrying}
          onClick={retry}
          type="button"
        >
          <RefreshCw size={15} />
          {retrying ? "Checking authority…" : "Reserve bounded retry"}
        </button>
      </section>
    );
  if (paymentActiveStates.has(state) && openCheckout !== undefined)
    return (
      <section className="action-bar">
        <div>
          <span className="metric-label">Payment in progress</span>
          <strong>Resume the same server-created order; no duplicate order is created.</strong>
        </div>
        <button className="button button-signal" onClick={openCheckout} type="button">
          Resume Razorpay checkout <ArrowRight size={15} />
        </button>
      </section>
    );
  if (state === "BLOCKED")
    return (
      <Alert tone="error">
        <strong>Blocked before payment.</strong> No budget reservation or merchant order was
        created.
      </Alert>
    );
  return (
    <Alert tone="info">
      No manual action is valid in this state. MindPay is reconciling signed server evidence.
    </Alert>
  );
}

function StateRail({ current }: Readonly<{ current: string }>) {
  const index = rail.indexOf(current as (typeof rail)[number]);
  const terminal =
    current === "BLOCKED" || current === "PAYMENT_FAILED" || current === "FULFILMENT_FAILED";
  return (
    <ol aria-label="Transaction lifecycle" className="state-rail">
      {rail.map((state, position) => (
        <li
          className={
            state === current ? "current" : index >= 0 && position < index ? "complete" : ""
          }
          key={state}
        >
          <span>{position + 1}</span>
          <small>{humanize(state)}</small>
        </li>
      ))}
      {terminal ? (
        <li className="failed current">
          <span>!</span>
          <small>{humanize(current)}</small>
        </li>
      ) : null}
    </ol>
  );
}

function DecisionLine({
  label,
  outcome,
  reasons,
}: Readonly<{
  label: string;
  outcome: string;
  reasons: readonly {
    code: string;
    evidence: Readonly<Record<string, boolean | number | string>>;
    severity: string;
  }[];
}>) {
  return (
    <div className="decision-line">
      <div>
        <span className="metric-label">{label}</span>
        <StatusBadge status={outcome} />
      </div>
      <div>
        {reasons.length === 0 ? (
          <p className="muted">No blocking reasons.</p>
        ) : (
          reasons.map((reason) => (
            <p className="reason" key={`${reason.code}-${reason.severity}`}>
              <span>
                <strong>{humanize(reason.code)}</strong>
                <small>{formatReasonEvidence(reason.evidence)}</small>
              </span>
              <span>{humanize(reason.severity)}</span>
            </p>
          ))
        )}
      </div>
    </div>
  );
}

function formatReasonEvidence(
  evidence: Readonly<Record<string, boolean | number | string>>,
): string {
  const entries = Object.entries(evidence);
  if (entries.length === 0) return "Server-evaluated fact did not meet the required condition.";
  return entries
    .map(
      ([key, value]) =>
        `${humanize(key)}: ${key.toLowerCase().includes("subunits") && typeof value === "number" ? formatInr(value) : String(value)}`,
    )
    .join(" · ");
}

function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <span className="metric-value data">{value}</span>
    </div>
  );
}
function messageFrom(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}
function isSettled(state: string | undefined): boolean {
  return state === undefined || evidenceStates.has(state);
}

async function loadRazorpay(): Promise<void> {
  if (window.Razorpay !== undefined) return;
  const existing = document.querySelector<HTMLScriptElement>("script[data-mindpay-razorpay]");
  if (existing !== null) {
    await new Promise<void>((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Razorpay Checkout failed to load.")),
        { once: true },
      );
    });
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.dataset.mindpayRazorpay = "true";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Razorpay Checkout failed to load.")), {
      once: true,
    });
    document.head.append(script);
  });
}
