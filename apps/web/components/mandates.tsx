"use client";

import {
  agentsResponseSchema,
  createMandateRequestSchema,
  createMandatesResponseSchema,
  mandatesResponseSchema,
  marketplaceServicesResponseSchema,
  mandateResponseSchema,
  passkeyCredentialsResponseSchema,
  type MandateResponse,
} from "@mindpay/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fingerprint, Plus, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import { apiRequest, idempotencyKey } from "@/lib/api";
import { formatDate, formatInr, shortId } from "@/lib/format";
import { useWorkspaceSession } from "@/lib/workspace";
import { getPasskeyAssertion, mandateChallengeResponseSchema } from "@/lib/webauthn";
import { Alert, ButtonLink, EmptyState, Loading, StatusBadge } from "./ui";

export function MandateList() {
  const { organizationId } = useWorkspaceSession();
  const client = useQueryClient();
  const [error, setError] = useState("");
  const mandates = useQuery({
    queryKey: ["mandates", organizationId],
    queryFn: () => apiRequest("/api/v1/mandates", mandatesResponseSchema, {}, organizationId),
    enabled: organizationId !== null,
  });
  const passkeys = useQuery({
    queryKey: ["passkeys"],
    queryFn: () => apiRequest("/api/v1/passkeys", passkeyCredentialsResponseSchema),
  });
  const activate = useMutation({
    mutationFn: async (mandateId: string) => {
      const credential = passkeys.data?.passkeys[0];
      if (credential === undefined)
        throw new Error("Register a passkey in Settings before activation.");
      const challenge = await apiRequest(
        `/api/v1/mandates/${encodeURIComponent(mandateId)}/challenges`,
        mandateChallengeResponseSchema,
        {
          body: JSON.stringify({ credentialId: credential.id }),
          headers: { "idempotency-key": idempotencyKey("mandate-challenge") },
          method: "POST",
        },
        organizationId,
      );
      const response = await getPasskeyAssertion(challenge.options);
      return apiRequest(
        `/api/v1/mandates/${encodeURIComponent(mandateId)}/activate`,
        mandateResponseSchema,
        {
          body: JSON.stringify({ challengeId: challenge.challengeId, response }),
          headers: { "idempotency-key": idempotencyKey("mandate-activate") },
          method: "POST",
        },
        organizationId,
      );
    },
    onSuccess: async () => {
      setError("");
      await client.invalidateQueries({ queryKey: ["mandates", organizationId] });
    },
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : "Mandate activation failed."),
  });
  if (mandates.isLoading || passkeys.isLoading)
    return <Loading label="Reconciling mandate limits" />;
  if (
    mandates.isError ||
    passkeys.isError ||
    mandates.data === undefined ||
    passkeys.data === undefined
  )
    return <Alert tone="error">Mandates or approval devices could not be loaded.</Alert>;
  return (
    <>
      <div className="page-title">
        <div>
          <h1>Mandates</h1>
          <p>User-owned limits that bound every agent proposal and payment.</p>
        </div>
        <div className="page-actions">
          <ButtonLink href="/app/mandates/new" tone="signal">
            <Plus size={15} /> New mandate
          </ButtonLink>
        </div>
      </div>
      {error === "" ? null : (
        <div style={{ marginBottom: 18 }}>
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <section className="panel">
        {mandates.data.mandates.length === 0 ? (
          <EmptyState
            action={
              <ButtonLink href="/app/mandates/new" tone="signal">
                Define a mandate
              </ButtonLink>
            }
            body="Create a checkout and payment mandate pair, review exact limits, then activate both with your passkey."
            title="No authority granted"
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mandate</th>
                  <th>Kind</th>
                  <th>Status</th>
                  <th>Limit</th>
                  <th>Expires</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {mandates.data.mandates.map((entry) => (
                  <Fragment key={entry.mandate.mandate_id}>
                    <tr>
                      <td className="data">
                        {shortId(entry.mandate.mandate_id)}
                        <div className="mono-id">{entry.payloadHash.slice(0, 14)}…</div>
                      </td>
                      <td>
                        {entry.mandate.schema_version.includes(".payment.")
                          ? "Payment"
                          : "Checkout"}
                      </td>
                      <td>
                        <StatusBadge status={entry.status} />
                      </td>
                      <td className="data">{mandateLimit(entry)}</td>
                      <td>{formatDate(entry.mandate.expires_at)}</td>
                      <td>
                        {entry.status === "DRAFT" ? (
                          <button
                            className="button button-secondary"
                            disabled={activate.isPending}
                            onClick={() => activate.mutate(entry.mandate.mandate_id)}
                            type="button"
                          >
                            <Fingerprint size={14} /> Activate
                          </button>
                        ) : (
                          <span className="muted">Server verified</span>
                        )}
                      </td>
                    </tr>
                    {entry.mandate.schema_version === "mindpay.mandate.payment.open.1" ? (
                      <tr className="usage-row">
                        <td colSpan={6}>
                          <SpendMeter
                            reserved={entry.usage.reservedSubunits}
                            spent={entry.usage.spentSubunits}
                            total={entry.mandate.total_budget_subunits}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export function MandateBuilder() {
  const router = useRouter();
  const { organizationId } = useWorkspaceSession();
  const agents = useQuery({
    queryKey: ["agents", organizationId],
    queryFn: () => apiRequest("/api/v1/agents", agentsResponseSchema, {}, organizationId),
    enabled: organizationId !== null,
  });
  const services = useQuery({
    queryKey: ["marketplace", "mandate"],
    queryFn: () =>
      apiRequest("/api/v1/marketplace/services?limit=100", marketplaceServicesResponseSchema),
  });
  const passkeys = useQuery({
    queryKey: ["passkeys"],
    queryFn: () => apiRequest("/api/v1/passkeys", passkeyCredentialsResponseSchema),
  });
  const [agentId, setAgentId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [budget, setBudget] = useState(1000);
  const [maxTransaction, setMaxTransaction] = useState(500);
  const [threshold, setThreshold] = useState(350);
  const [attempts, setAttempts] = useState(2);
  const [maxTransactions, setMaxTransactions] = useState(3);
  const [maxLineItems, setMaxLineItems] = useState(1);
  const [maxQuantity, setMaxQuantity] = useState(1);
  const [expiry, setExpiry] = useState(() =>
    localDateTime(new Date(Date.now() + 24 * 60 * 60_000)),
  );
  const [error, setError] = useState("");
  const selectedServices = useMemo(
    () => services.data?.services.filter((service) => selected.includes(service.id)) ?? [],
    [selected, services.data],
  );
  const create = useMutation({
    mutationFn: async () => {
      const passkey = passkeys.data?.passkeys[0];
      if (passkey === undefined)
        throw new Error("Register a passkey in Settings before creating authority.");
      const request = createMandateRequestSchema.parse({
        agentId,
        allowedCategories: [...new Set(selectedServices.map((service) => service.category))],
        allowedMerchants: [...new Set(selectedServices.map((service) => service.merchant.id))],
        allowedRails: ["razorpay:test"],
        allowedServices: selectedServices.map((service) => service.externalId),
        approvalThresholdSubunits: Math.round(threshold * 100),
        currency: "INR",
        expiresAt: new Date(expiry).toISOString(),
        maxAttemptsPerTransaction: attempts,
        maxLineItems,
        maxQuantityPerItem: maxQuantity,
        maxTransactionSubunits: Math.round(maxTransaction * 100),
        maxTransactions,
        maxUnitPriceSubunits: Math.round(maxTransaction * 100),
        passkeyId: passkey.id,
        totalBudgetSubunits: Math.round(budget * 100),
      });
      return apiRequest(
        "/api/v1/mandates",
        createMandatesResponseSchema,
        {
          body: JSON.stringify(request),
          headers: { "idempotency-key": idempotencyKey("mandates") },
          method: "POST",
        },
        organizationId,
      );
    },
    onSuccess: () => router.push("/app/mandates"),
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : "The mandate pair could not be created."),
  });
  if (agents.isLoading || services.isLoading || passkeys.isLoading)
    return <Loading label="Loading mandate inputs" />;
  if (
    agents.isError ||
    services.isError ||
    passkeys.isError ||
    agents.data === undefined ||
    services.data === undefined ||
    passkeys.data === undefined
  )
    return <Alert tone="error">Verified agents, services, or passkeys could not be loaded.</Alert>;
  if (agents.data.agents.length === 0)
    return (
      <EmptyState
        action={
          <ButtonLink href="/app/agents/new" tone="signal">
            Create agent
          </ButtonLink>
        }
        body="A mandate must bind one existing agent identity and version."
        title="Create an agent first"
      />
    );
  if (passkeys.data.passkeys.length === 0)
    return (
      <EmptyState
        action={
          <ButtonLink href="/app/settings" tone="signal">
            Register passkey
          </ButtonLink>
        }
        body="The server requires a registered passkey before it will create a mandate pair."
        title="Approval device required"
      />
    );
  return (
    <>
      <div className="page-title">
        <div>
          <h1>Mandate builder</h1>
          <p>
            Review all nine authority sections. Creation stores drafts; passkey activation happens
            from the mandate register.
          </p>
        </div>
      </div>
      <form
        className="panel panel-body stack"
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          create.mutate();
        }}
      >
        <FormSection
          title="Agent identity"
          body="The authority is cryptographically bound to one agent and its current version."
        >
          <div className="field">
            <label htmlFor="mandate-agent">Agent</label>
            <select
              className="select"
              id="mandate-agent"
              onChange={(event) => setAgentId(event.target.value)}
              required
              value={agentId}
            >
              <option value="">Choose an agent</option>
              {agents.data.agents
                .filter((agent) => agent.currentVersionId !== null)
                .map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
            </select>
          </div>
        </FormSection>
        <FormSection
          title="Merchant allowlist"
          body="Selecting services derives an exact merchant allowlist; no free-form payee is accepted."
        >
          <ServiceChecks
            selected={selected}
            services={services.data.services}
            setSelected={setSelected}
          />
        </FormSection>
        <FormSection
          title="Service and category scope"
          body="External service IDs and categories are copied from currently verified catalog versions."
        >
          <p className="data">
            {selectedServices.length === 0
              ? "No service selected"
              : selectedServices
                  .map((service) => `${service.externalId} · ${service.category}`)
                  .join("\n")}
          </p>
        </FormSection>
        <FormSection
          title="Budget limits"
          body="All amounts are converted once into integer paise at submission."
        >
          <div className="form-grid">
            <MoneyInput id="budget" label="Total budget" value={budget} setValue={setBudget} />
            <MoneyInput
              id="max-transaction"
              label="Per transaction"
              value={maxTransaction}
              setValue={setMaxTransaction}
            />
          </div>
        </FormSection>
        <FormSection
          title="Approval threshold"
          body="Proposals above this amount stop for an exact passkey step-up."
        >
          <MoneyInput
            id="threshold"
            label="Approval above"
            value={threshold}
            setValue={setThreshold}
          />
        </FormSection>
        <FormSection
          title="Attempt and transaction bounds"
          body="Payment retries and completed purchases both have hard caps."
        >
          <div className="form-grid">
            <NumberInput
              id="attempts"
              label="Attempts per transaction"
              max={10}
              value={attempts}
              setValue={setAttempts}
            />
            <NumberInput
              id="transactions"
              label="Maximum transactions"
              max={1000}
              value={maxTransactions}
              setValue={setMaxTransactions}
            />
          </div>
        </FormSection>
        <FormSection
          title="Basket constraints"
          body="Line count, quantity, and unit price cannot expand after activation."
        >
          <div className="form-grid">
            <NumberInput
              id="line-items"
              label="Maximum line items"
              max={20}
              value={maxLineItems}
              setValue={setMaxLineItems}
            />
            <NumberInput
              id="quantity"
              label="Quantity per item"
              max={100}
              value={maxQuantity}
              setValue={setMaxQuantity}
            />
          </div>
        </FormSection>
        <FormSection
          title="Payment rail"
          body="This build is intentionally restricted to Razorpay Test Mode."
        >
          <div className="alert alert-info">
            <ShieldCheck size={18} /> razorpay:test · no card or UPI credential touches MindPay
          </div>
        </FormSection>
        <FormSection
          title="Expiry and approval key"
          body="Expired authority cannot be renewed implicitly; create and approve a new pair."
        >
          <div className="form-grid">
            <div className="field">
              <label htmlFor="expiry">Expires</label>
              <input
                className="input"
                id="expiry"
                min={localDateTime(new Date(Date.now() + 5 * 60_000))}
                onChange={(event) => setExpiry(event.target.value)}
                required
                type="datetime-local"
                value={expiry}
              />
            </div>
            <div className="field">
              <span className="field-label">Passkey</span>
              <span className="input" style={{ alignItems: "center", display: "flex" }}>
                <Fingerprint size={16} style={{ marginRight: 8 }} />
                {passkeys.data.passkeys[0]?.name ?? "Registered approval key"}
              </span>
            </div>
          </div>
        </FormSection>
        {error === "" ? null : <Alert tone="error">{error}</Alert>}
        <div className="form-actions">
          <Link className="button button-secondary" href="/app/mandates">
            Cancel
          </Link>
          <button
            className="button button-signal"
            disabled={create.isPending || selected.length === 0 || agentId === ""}
            type="submit"
          >
            {create.isPending ? "Canonicalizing authority…" : "Create two mandate drafts"}
          </button>
        </div>
      </form>
    </>
  );
}

function FormSection({
  body,
  children,
  title,
}: Readonly<{ body: string; children: React.ReactNode; title: string }>) {
  return (
    <section className="form-section">
      <h2>{title}</h2>
      <p>{body}</p>
      {children}
    </section>
  );
}
function ServiceChecks({
  selected,
  services,
  setSelected,
}: Readonly<{
  selected: string[];
  services: readonly {
    id: string;
    merchant: { name: string };
    name: string;
    priceSubunits: number;
  }[];
  setSelected: React.Dispatch<React.SetStateAction<string[]>>;
}>) {
  return (
    <div className="check-grid">
      {services.map((service) => (
        <label className="check-row" key={service.id}>
          <input
            checked={selected.includes(service.id)}
            onChange={(event) =>
              setSelected((current) =>
                event.target.checked
                  ? [...current, service.id]
                  : current.filter((id) => id !== service.id),
              )
            }
            type="checkbox"
          />
          <span>
            <strong>{service.name}</strong>
            <small style={{ display: "block" }}>
              {service.merchant.name} · {formatInr(service.priceSubunits)}
            </small>
          </span>
        </label>
      ))}
    </div>
  );
}
function MoneyInput({
  id,
  label,
  setValue,
  value,
}: Readonly<{ id: string; label: string; setValue: (value: number) => void; value: number }>) {
  return (
    <div className="field">
      <label htmlFor={id}>{label} (₹)</label>
      <input
        className="input data"
        id={id}
        min="0"
        onChange={(event) => setValue(event.target.valueAsNumber)}
        required
        step="0.01"
        type="number"
        value={value}
      />
    </div>
  );
}
function NumberInput({
  id,
  label,
  max,
  setValue,
  value,
}: Readonly<{
  id: string;
  label: string;
  max: number;
  setValue: (value: number) => void;
  value: number;
}>) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        className="input data"
        id={id}
        max={max}
        min="1"
        onChange={(event) => setValue(event.target.valueAsNumber)}
        required
        step="1"
        type="number"
        value={value}
      />
    </div>
  );
}
function localDateTime(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function SpendMeter({
  reserved,
  spent,
  total,
}: Readonly<{ reserved: number; spent: number; total: number }>) {
  const controlled = Math.min(total, reserved + spent);
  const percent = total === 0 ? 0 : Math.round((controlled / total) * 100);
  return (
    <div className="spend-meter">
      <div className="spend-meter-copy">
        <span>
          Budget usage · {formatInr(spent)} spent · {formatInr(reserved)} reserved
        </span>
        <strong className="data">{formatInr(total - controlled)} available</strong>
      </div>
      <div
        aria-label={`${percent}% of mandate budget controlled`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        className="spend-track"
        role="progressbar"
      >
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function mandateLimit(entry: MandateResponse): string {
  const mandate = entry.mandate;
  if (mandate.schema_version === "mindpay.mandate.payment.open.1")
    return formatInr(mandate.max_transaction_subunits);
  if (mandate.schema_version === "mindpay.mandate.checkout.open.1")
    return `${mandate.line_item_constraints.max_line_items} item${mandate.line_item_constraints.max_line_items === 1 ? "" : "s"}`;
  if (mandate.schema_version === "mindpay.mandate.payment.closed.1")
    return formatInr(mandate.amount_subunits);
  return `${mandate.line_items.length} item${mandate.line_items.length === 1 ? "" : "s"}`;
}
