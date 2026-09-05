"use client";

import {
  agentResponseSchema,
  agentsResponseSchema,
  merchantAdministrationListResponseSchema,
  merchantAdministrationResponseSchema,
} from "@mindpay/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Bot, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { apiRequest, idempotencyKey } from "@/lib/api";
import { formatDate, humanize, shortId } from "@/lib/format";
import { useWorkspaceSession } from "@/lib/workspace";
import { Alert, EmptyState, Loading, Panel, StatusBadge } from "./ui";

export function MerchantReviewQueue() {
  const { organizationId } = useWorkspaceSession();
  const merchants = useMerchants(organizationId);
  if (merchants.isLoading) return <Loading label="Reading merchant assurance state" />;
  if (merchants.isError || merchants.data === undefined) return <RoleAlert />;
  return (
    <>
      <div className="page-title">
        <div>
          <h1 className="balance">Merchant review</h1>
          <p>
            Verification is server-run against the current manifest, signing keys, catalog, and Test
            Mode payment configuration.
          </p>
        </div>
      </div>
      <section className="panel">
        {merchants.data.merchants.length === 0 ? (
          <EmptyState
            body="No merchants have been submitted in this workspace."
            title="Review queue clear"
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Merchant</th>
                  <th>Verification</th>
                  <th>Operation</th>
                  <th>Risk</th>
                  <th>Last checked</th>
                </tr>
              </thead>
              <tbody>
                {merchants.data.merchants.map(({ merchant, verification }) => (
                  <tr key={merchant.id}>
                    <td>
                      <Link className="row-link" href={`/admin/merchants/${merchant.id}`}>
                        {merchant.name}
                      </Link>
                      <div className="mono-id">{merchant.domain}</div>
                    </td>
                    <td>
                      <StatusBadge status={merchant.verificationStatus} />
                      <div className="mono-id">{verification.result}</div>
                    </td>
                    <td>
                      <StatusBadge status={merchant.operationalStatus} />
                    </td>
                    <td>
                      <StatusBadge status={merchant.riskTier} />
                    </td>
                    <td>
                      {merchant.verifiedAt === null ? "Not yet" : formatDate(merchant.verifiedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export function MerchantReviewDetail({ merchantId }: Readonly<{ merchantId: string }>) {
  const client = useQueryClient();
  const { organizationId } = useWorkspaceSession();
  const [error, setError] = useState("");
  const merchants = useMerchants(organizationId);
  const mutate = useMutation({
    mutationFn: (action: "reverify" | "suspend" | "verify") =>
      apiRequest(
        `/api/v1/admin/merchants/${encodeURIComponent(merchantId)}/${action}`,
        merchantAdministrationResponseSchema,
        {
          body: "{}",
          headers: { "idempotency-key": idempotencyKey(`merchant-${action}`) },
          method: "POST",
        },
        organizationId,
      ),
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : "The assurance action failed."),
    onSuccess: async () => {
      setError("");
      await client.invalidateQueries({ queryKey: ["admin-merchants", organizationId] });
    },
  });
  if (merchants.isLoading) return <Loading label="Reading merchant verification evidence" />;
  if (merchants.isError || merchants.data === undefined) return <RoleAlert />;
  const record = merchants.data.merchants.find(({ merchant }) => merchant.id === merchantId);
  if (record === undefined)
    return <Alert tone="error">This merchant is not in the active workspace review scope.</Alert>;
  const recoverable =
    record.merchant.verificationStatus === "QUARANTINED" ||
    record.merchant.verificationStatus === "REVIEW_REQUIRED";
  return (
    <>
      <div className="page-title">
        <div>
          <h1>{record.merchant.name}</h1>
          <p>
            {record.merchant.domain} · {record.merchant.id}
          </p>
        </div>
        <div className="page-actions">
          <StatusBadge status={record.merchant.verificationStatus} />
        </div>
      </div>
      {error === "" ? null : (
        <div style={{ marginBottom: 18 }}>
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      {recoverable ? (
        <div style={{ marginBottom: 18 }}>
          <Alert tone="warning">
            <strong>Recovery is explicit.</strong> Correct the merchant publication or signature at
            its canonical origin, then run re-verification. Existing approved catalog versions are
            never silently changed.
          </Alert>
        </div>
      ) : null}
      <div className="metric-strip">
        <Metric label="Verification" value={record.verification.result} />
        <Metric label="Operational" value={record.merchant.operationalStatus} />
        <Metric label="Risk tier" value={record.merchant.riskTier} />
        <Metric label="Catalog" value={record.verification.catalogVersion ?? "None"} />
      </div>
      <div className="grid-2">
        <Panel title="Assurance evidence">
          <dl className="ledger-list">
            <Fact label="Tier" value={record.merchant.verificationTier} />
            <Fact
              label="Last verified"
              value={
                record.merchant.verifiedAt === null
                  ? "Not verified"
                  : formatDate(record.merchant.verifiedAt)
              }
            />
            <Fact label="Current result" value={record.verification.result} />
            <Fact
              label="Reason"
              value={
                record.verification.reason === null
                  ? "No failure recorded"
                  : humanize(record.verification.reason)
              }
            />
          </dl>
        </Panel>
        <Panel title="Controlled actions">
          <div className="stack">
            <p className="muted">
              Each action is role-checked, idempotent, and server-derived. Verification never trusts
              this browser.
            </p>
            <button
              className="button button-signal"
              disabled={mutate.isPending}
              onClick={() => mutate.mutate(recoverable ? "reverify" : "verify")}
              type="button"
            >
              <RefreshCw size={15} />
              {mutate.isPending
                ? "Running checks…"
                : recoverable
                  ? "Reverify corrected publication"
                  : "Run full verification"}
            </button>
            {record.merchant.operationalStatus === "ACTIVE" ? (
              <button
                className="button button-danger"
                disabled={mutate.isPending}
                onClick={() => mutate.mutate("suspend")}
                type="button"
              >
                <AlertTriangle size={15} /> Suspend merchant
              </button>
            ) : (
              <Alert tone="warning">
                This merchant is not operational. Restoration requires a fresh verified
                administrative decision; no automatic resume is exposed.
              </Alert>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}

export function IncidentQueue() {
  const { organizationId } = useWorkspaceSession();
  const merchants = useMerchants(organizationId);
  if (merchants.isLoading) return <Loading label="Reconciling quarantine state" />;
  if (merchants.isError || merchants.data === undefined) return <RoleAlert />;
  const incidents = merchants.data.merchants.filter(
    ({ merchant }) =>
      merchant.operationalStatus !== "ACTIVE" ||
      merchant.verificationStatus === "QUARANTINED" ||
      merchant.verificationStatus === "REVIEW_REQUIRED",
  );
  return (
    <>
      <div className="page-title">
        <div>
          <h1>Incidents & quarantine</h1>
          <p>
            Material publication changes, signature failures, and operator suspensions stay visible
            until explicitly reviewed.
          </p>
        </div>
      </div>
      <section className="panel">
        {incidents.length === 0 ? (
          <EmptyState
            body="No merchant is suspended, quarantined, or waiting on material-change review."
            title="No active incidents"
          />
        ) : (
          <div className="ledger-list panel-body">
            {incidents.map((record) => (
              <article className="incident-row" key={record.merchant.id}>
                <span className="incident-mark">
                  <AlertTriangle />
                </span>
                <div>
                  <strong>{record.merchant.name}</strong>
                  <p>
                    {record.verification.reason === null
                      ? humanize(record.merchant.verificationStatus)
                      : humanize(record.verification.reason)}
                  </p>
                  <div className="service-meta">
                    <StatusBadge status={record.merchant.verificationStatus} />
                    <StatusBadge status={record.merchant.operationalStatus} />
                  </div>
                </div>
                <Link
                  className="button button-secondary"
                  href={`/admin/merchants/${record.merchant.id}`}
                >
                  Resolve <ArrowRight size={14} />
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export function AgentAssuranceList() {
  const { organizationId } = useWorkspaceSession();
  const agents = useQuery({
    enabled: organizationId !== null,
    queryFn: () => apiRequest("/api/v1/agents", agentsResponseSchema, {}, organizationId),
    queryKey: ["admin-agents", organizationId],
  });
  if (agents.isLoading) return <Loading label="Reading immutable agent versions" />;
  if (agents.isError || agents.data === undefined) return <RoleAlert />;
  return (
    <>
      <div className="page-title">
        <div>
          <h1>Agent assurance</h1>
          <p>
            Read-only review of published identity, tool scope, policy hash, and evaluation status.
          </p>
        </div>
      </div>
      <section className="panel">
        {agents.data.agents.length === 0 ? (
          <EmptyState
            body="No agent identities exist in this workspace."
            title="Nothing to review"
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Published version</th>
                  <th>Evaluation</th>
                  <th>Bound tools</th>
                </tr>
              </thead>
              <tbody>
                {agents.data.agents.map((agent) => {
                  const version = agent.versions.find(
                    (candidate) => candidate.id === agent.currentVersionId,
                  );
                  return (
                    <tr key={agent.id}>
                      <td>
                        <Link className="row-link" href={`/admin/agents/${agent.id}`}>
                          {agent.name}
                        </Link>
                        <div className="mono-id">{shortId(agent.id)}</div>
                      </td>
                      <td>{version?.version ?? "None"}</td>
                      <td>
                        <StatusBadge status={version?.verificationStatus ?? "NOT_RUN"} />
                      </td>
                      <td>{version?.toolBindings.length ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export function AgentAssuranceDetail({ agentId }: Readonly<{ agentId: string }>) {
  const { organizationId } = useWorkspaceSession();
  const agent = useQuery({
    enabled: organizationId !== null,
    queryFn: () =>
      apiRequest(
        `/api/v1/agents/${encodeURIComponent(agentId)}`,
        agentResponseSchema,
        {},
        organizationId,
      ),
    queryKey: ["admin-agent", organizationId, agentId],
    retry: false,
  });
  if (agent.isLoading) return <Loading label="Reading agent assurance evidence" />;
  if (agent.isError || agent.data === undefined) return <RoleAlert />;
  const value = agent.data.agent;
  const current = value.versions.find((version) => version.id === value.currentVersionId);
  return (
    <>
      <div className="page-title">
        <div>
          <h1>{value.name}</h1>
          <p>{value.description}</p>
        </div>
        <div className="page-actions">
          <StatusBadge status={current?.verificationStatus ?? "NOT_RUN"} />
        </div>
      </div>
      <div className="grid-2">
        <Panel title="Published identity">
          {current === undefined ? (
            <Alert tone="warning">No version is currently published.</Alert>
          ) : (
            <dl className="ledger-list">
              <Fact label="Version" value={current.version} />
              <Fact label="Model" value={`${current.modelProvider} · ${current.modelName}`} />
              <Fact label="Policy hash" value={current.systemPolicyHash} />
              <Fact label="Signing key" value={value.key.kid} />
              <Fact
                label="Published"
                value={
                  current.publishedAt === null ? "Not published" : formatDate(current.publishedAt)
                }
              />
            </dl>
          )}
        </Panel>
        <Panel title="Scope review">
          {current === undefined ? (
            <p className="muted">Publish an immutable version before assurance review.</p>
          ) : (
            <div className="stack">
              <Alert tone={current.verificationStatus === "FAILED" ? "error" : "info"}>
                <Bot size={16} />
                <span>
                  Evaluation state: <strong>{humanize(current.verificationStatus)}</strong>.
                  Published configuration cannot be edited; remediation requires a new version.
                </span>
              </Alert>
              <div className="check-grid">
                {current.toolBindings.map((binding) => (
                  <div className="check-row" key={binding.toolVersionId}>
                    <ShieldCheck size={15} />
                    <span>
                      <strong>{binding.toolVersionId}</strong>
                      <small style={{ display: "block" }}>
                        Scope is rendered from the canonical version contract.
                      </small>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

function useMerchants(organizationId: string | null) {
  return useQuery({
    enabled: organizationId !== null,
    queryFn: () =>
      apiRequest(
        "/api/v1/admin/merchants",
        merchantAdministrationListResponseSchema,
        {},
        organizationId,
      ),
    queryKey: ["admin-merchants", organizationId],
  });
}
function RoleAlert() {
  return (
    <Alert tone="error">
      Merchant review requires an Owner, Admin, or Reviewer role in the active workspace.
    </Alert>
  );
}
function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <span className="metric-value data">{value}</span>
    </div>
  );
}
function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="ledger-item" style={{ gridTemplateColumns: ".7fr 1.3fr", padding: "13px 0" }}>
      <dt className="muted">{label}</dt>
      <dd className="data" style={{ margin: 0, overflowWrap: "anywhere" }}>
        {value}
      </dd>
    </div>
  );
}
