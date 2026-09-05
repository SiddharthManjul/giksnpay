"use client";

import {
  agentResponseSchema,
  agentsResponseSchema,
  approvedAgentToolVersionIds,
  createAgentRequestSchema,
  createAgentVersionRequestSchema,
} from "@mindpay/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Bot, Check, KeyRound, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest, idempotencyKey } from "@/lib/api";
import { formatDate, shortId } from "@/lib/format";
import { useWorkspaceSession } from "@/lib/workspace";
import { Alert, ButtonLink, EmptyState, Loading, Panel, StatusBadge } from "./ui";

export function AgentList() {
  const { organizationId } = useWorkspaceSession();
  const agents = useQuery({
    queryKey: ["agents", organizationId],
    queryFn: () => apiRequest("/api/v1/agents", agentsResponseSchema, {}, organizationId),
    enabled: organizationId !== null,
  });
  if (agents.isLoading) return <Loading label="Reading signed agent versions" />;
  if (agents.isError || agents.data === undefined)
    return <Alert tone="error">Agents could not be loaded from this workspace.</Alert>;
  return (
    <>
      <div className="page-title">
        <div>
          <h1>Agents</h1>
          <p>Versioned identities with encrypted signing keys and explicitly bound tools.</p>
        </div>
        <div className="page-actions">
          <ButtonLink href="/app/agents/new" tone="signal">
            <Plus size={15} /> Create agent
          </ButtonLink>
        </div>
      </div>
      <section className="panel">
        {agents.data.agents.length === 0 ? (
          <EmptyState
            action={
              <ButtonLink href="/app/agents/new" tone="signal">
                Create the first agent
              </ButtonLink>
            }
            body="An agent needs an identity, an immutable version, and approved tool scopes before it can run."
            title="No agents configured"
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Current version</th>
                  <th>Verification</th>
                  <th>Tools</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {agents.data.agents.map((agent) => {
                  const current = agent.versions.find(
                    (version) => version.id === agent.currentVersionId,
                  );
                  return (
                    <tr key={agent.id}>
                      <td>
                        <Link className="row-link" href={`/app/agents/${agent.id}`}>
                          {agent.name}
                        </Link>
                        <div className="mono-id">{shortId(agent.id)}</div>
                      </td>
                      <td className="data">{current?.version ?? "Not published"}</td>
                      <td>
                        <StatusBadge status={current?.verificationStatus ?? "NOT_RUN"} />
                      </td>
                      <td>{current?.toolBindings.length ?? 0}</td>
                      <td>{formatDate(agent.updatedAt)}</td>
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

export function NewAgentForm() {
  const router = useRouter();
  const { organizationId } = useWorkspaceSession();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const create = useMutation({
    mutationFn: async () => {
      const request = createAgentRequestSchema.parse({ name, slug, description });
      return apiRequest(
        "/api/v1/agents",
        agentResponseSchema,
        {
          body: JSON.stringify(request),
          headers: { "idempotency-key": idempotencyKey("agent") },
          method: "POST",
        },
        organizationId,
      );
    },
    onSuccess: (result) => router.push(`/app/agents/${result.agent.id}`),
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : "The agent could not be created."),
  });
  return (
    <>
      <div className="page-title">
        <div>
          <h1>Create agent</h1>
          <p>
            Start with its durable identity. Policy, model, and tools are added as an immutable
            version.
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
        <div className="form-grid">
          <div className="field">
            <label htmlFor="agent-name">Name</label>
            <input
              className="input"
              id="agent-name"
              maxLength={120}
              minLength={2}
              onChange={(event) => {
                setName(event.target.value);
                if (slug === "")
                  setSlug(
                    event.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/gu, "-")
                      .replace(/^-|-$/gu, ""),
                  );
              }}
              required
              value={name}
            />
          </div>
          <div className="field">
            <label htmlFor="agent-slug">Stable slug</label>
            <input
              className="input data"
              id="agent-slug"
              onChange={(event) => setSlug(event.target.value)}
              pattern="[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
              required
              value={slug}
            />
            <small>
              Used in durable references; changing display text will not change this key.
            </small>
          </div>
        </div>
        <div className="field">
          <label htmlFor="agent-description">Responsibility</label>
          <textarea
            className="textarea"
            id="agent-description"
            maxLength={2000}
            minLength={10}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Discovers and proposes verified business research within a user mandate."
            required
            value={description}
          />
        </div>
        {error === "" ? null : <Alert tone="error">{error}</Alert>}
        <div className="form-actions">
          <Link className="button button-secondary" href="/app/agents">
            Cancel
          </Link>
          <button className="button button-signal" disabled={create.isPending} type="submit">
            {create.isPending ? "Generating signing identity…" : "Create agent"}
            <ArrowRight size={15} />
          </button>
        </div>
      </form>
    </>
  );
}

export function AgentDetail({ agentId }: Readonly<{ agentId: string }>) {
  const { organizationId } = useWorkspaceSession();
  const client = useQueryClient();
  const [error, setError] = useState("");
  const [showVersion, setShowVersion] = useState(false);
  const agent = useQuery({
    queryKey: ["agent", organizationId, agentId],
    queryFn: () =>
      apiRequest(
        `/api/v1/agents/${encodeURIComponent(agentId)}`,
        agentResponseSchema,
        {},
        organizationId,
      ),
    enabled: organizationId !== null,
    retry: false,
  });
  const publish = useMutation({
    mutationFn: (versionId: string) =>
      apiRequest(
        `/api/v1/agents/${encodeURIComponent(agentId)}/publish`,
        agentResponseSchema,
        {
          body: JSON.stringify({ versionId }),
          headers: { "idempotency-key": idempotencyKey("publish") },
          method: "POST",
        },
        organizationId,
      ),
    onSuccess: async () => {
      setError("");
      await client.invalidateQueries({ queryKey: ["agent", organizationId, agentId] });
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Publication failed."),
  });
  if (agent.isLoading) return <Loading label="Reading agent identity" />;
  if (agent.isError || agent.data === undefined)
    return <Alert tone="error">This agent was not found in the active workspace.</Alert>;
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
          <button
            className="button button-signal"
            onClick={() => setShowVersion((shown) => !shown)}
            type="button"
          >
            <Plus size={15} /> {showVersion ? "Close builder" : "New version"}
          </button>
        </div>
      </div>
      <div className="metric-strip">
        <Metric label="Status" value={value.status} />
        <Metric label="Published" value={current?.version ?? "None"} />
        <Metric label="Versions" value={String(value.versions.length)} />
        <Metric label="Key" value={shortId(value.key.kid)} />
      </div>
      {error === "" ? null : (
        <div style={{ marginBottom: 18 }}>
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      {showVersion ? (
        <div style={{ marginBottom: 22 }}>
          <VersionForm
            agentId={agentId}
            onCreated={async () => {
              setShowVersion(false);
              await client.invalidateQueries({ queryKey: ["agent", organizationId, agentId] });
            }}
            organizationId={organizationId}
          />
        </div>
      ) : null}
      <div className="grid-2">
        <Panel title="Immutable versions">
          {value.versions.length === 0 ? (
            <EmptyState
              body="Create a version to bind the Gemini model, deterministic policy, and approved tools."
              title="No versions"
            />
          ) : (
            <div className="ledger-list">
              {[...value.versions].reverse().map((version) => (
                <article
                  className="ledger-item"
                  key={version.id}
                  style={{ gridTemplateColumns: "1fr" }}
                >
                  <div
                    style={{
                      alignItems: "start",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <strong>Version {version.version}</strong>
                      <p className="mono-id">{shortId(version.id)}</p>
                    </div>
                    <StatusBadge
                      status={
                        version.id === value.currentVersionId
                          ? "PUBLISHED"
                          : version.verificationStatus
                      }
                    />
                  </div>
                  <p>{version.specialization}</p>
                  <div className="service-meta">
                    {version.toolBindings.map((binding) => (
                      <span className="badge state-neutral" key={binding.toolVersionId}>
                        {binding.toolVersionId}
                      </span>
                    ))}
                  </div>
                  {version.id !== value.currentVersionId ? (
                    <button
                      className="button button-secondary"
                      disabled={publish.isPending}
                      onClick={() => publish.mutate(version.id)}
                      type="button"
                    >
                      <Check size={14} /> Publish this exact version
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Signing identity">
          <div style={{ alignItems: "center", display: "flex", gap: 13, marginBottom: 20 }}>
            <span className="empty-icon" style={{ margin: 0 }}>
              <KeyRound />
            </span>
            <div>
              <strong>{value.key.kid}</strong>
              <p className="muted" style={{ margin: "3px 0" }}>
                Private JWK encrypted at rest; public key shown below.
              </p>
            </div>
          </div>
          <pre
            className="data"
            style={{
              background: "var(--paper-deep)",
              borderRadius: 10,
              fontSize: 11,
              margin: 0,
              overflow: "auto",
              padding: 14,
            }}
          >
            {JSON.stringify(value.key.publicJwk, null, 2)}
          </pre>
        </Panel>
      </div>
    </>
  );
}

function VersionForm({
  agentId,
  onCreated,
  organizationId,
}: Readonly<{ agentId: string; onCreated: () => Promise<void>; organizationId: string | null }>) {
  const [version, setVersion] = useState("1.0.0");
  const [specialization, setSpecialization] = useState("Verified service procurement");
  const [policy, setPolicy] = useState(
    "Use only verified MindPay services and approved tools. Never create payment authority or expand a user mandate.",
  );
  const [tools, setTools] = useState<string[]>(approvedAgentToolVersionIds.slice(0, 4));
  const [error, setError] = useState("");
  const create = useMutation({
    mutationFn: async () => {
      const request = createAgentVersionRequestSchema.parse({
        configuration: { maxOutputTokens: 2048, temperature: 0.2 },
        modelName: "gemini-3.8-flash",
        modelProvider: "google",
        specialization,
        systemPolicy: policy,
        toolBindings: tools.map((toolVersionId) => ({
          scope:
            toolVersionId.startsWith("get_") &&
            (toolVersionId.includes("transaction") || toolVersionId.includes("evidence"))
              ? {}
              : { allowedCategories: ["business_research"], maximumPriceSubunits: 100_000 },
          toolVersionId,
        })),
        version,
      });
      return apiRequest(
        `/api/v1/agents/${encodeURIComponent(agentId)}/versions`,
        agentResponseSchema,
        {
          body: JSON.stringify(request),
          headers: { "idempotency-key": idempotencyKey("version") },
          method: "POST",
        },
        organizationId,
      );
    },
    onSuccess: onCreated,
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : "Version creation failed."),
  });
  return (
    <form
      className="panel panel-body stack"
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        create.mutate();
      }}
    >
      <div className="form-grid">
        <div className="field">
          <label htmlFor="version">Semantic version</label>
          <input
            className="input data"
            id="version"
            onChange={(event) => setVersion(event.target.value)}
            required
            value={version}
          />
        </div>
        <div className="field">
          <label htmlFor="specialization">Specialization</label>
          <input
            className="input"
            id="specialization"
            minLength={2}
            onChange={(event) => setSpecialization(event.target.value)}
            required
            value={specialization}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="policy">System policy</label>
        <textarea
          className="textarea"
          id="policy"
          minLength={20}
          onChange={(event) => setPolicy(event.target.value)}
          required
          value={policy}
        />
      </div>
      <fieldset className="field">
        <legend className="field-label">Approved tools</legend>
        <div className="check-grid">
          {approvedAgentToolVersionIds.map((tool) => (
            <label className="check-row" key={tool}>
              <input
                checked={tools.includes(tool)}
                onChange={(event) =>
                  setTools((current) =>
                    event.target.checked
                      ? [...current, tool]
                      : current.filter((value) => value !== tool),
                  )
                }
                type="checkbox"
              />
              <span>
                <strong>{tool}</strong>
                <small style={{ display: "block" }}>
                  Scope is restricted to business_research and ₹1,000 where applicable.
                </small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {error === "" ? null : <Alert tone="error">{error}</Alert>}
      <div className="form-actions">
        <button className="button button-signal" disabled={create.isPending} type="submit">
          <Bot size={15} />
          {create.isPending ? "Signing version…" : "Create immutable version"}
        </button>
      </div>
    </form>
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
