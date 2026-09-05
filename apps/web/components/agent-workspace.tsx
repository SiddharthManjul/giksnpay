"use client";

import {
  agentRunResponseSchema,
  agentsResponseSchema,
  createAgentRunRequestSchema,
  createManualAgentRunRequestSchema,
  marketplaceServicesResponseSchema,
  purchasePreparationRequestSchema,
  purchasePreparationResponseSchema,
  transactionProposalResponseSchema,
  type AgentRun,
} from "@mindpay/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Bot, CircleDot, ShieldCheck, Wrench } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiRequest, idempotencyKey } from "@/lib/api";
import { formatDate, formatInr, humanize, shortId } from "@/lib/format";
import { useWorkspaceSession } from "@/lib/workspace";
import { Alert, ButtonLink, EmptyState, Loading, Panel, StatusBadge } from "./ui";

export function AgentWorkspace() {
  const router = useRouter();
  const search = useSearchParams();
  const { organizationId } = useWorkspaceSession();
  const [agentId, setAgentId] = useState("");
  const [intent, setIntent] = useState("");
  const [manualServiceId, setManualServiceId] = useState("");
  const [run, setRun] = useState<AgentRun | null>(null);
  const [error, setError] = useState("");
  const agents = useQuery({
    enabled: organizationId !== null,
    queryFn: () => apiRequest("/api/v1/agents", agentsResponseSchema, {}, organizationId),
    queryKey: ["agents", organizationId],
  });
  const services = useQuery({
    queryFn: () =>
      apiRequest(
        "/api/v1/marketplace/services?availability=available&limit=100",
        marketplaceServicesResponseSchema,
      ),
    queryKey: ["marketplace", "workspace"],
  });
  const publishedAgents = useMemo(
    () => agents.data?.agents.filter((agent) => agent.currentVersionId !== null) ?? [],
    [agents.data],
  );

  useEffect(() => {
    const requested = search.get("service");
    if (requested !== null) setManualServiceId(requested);
  }, [search]);
  useEffect(() => {
    if (agentId === "" && publishedAgents[0] !== undefined) setAgentId(publishedAgents[0].id);
  }, [agentId, publishedAgents]);

  const start = useMutation({
    mutationFn: async () => {
      const request = createAgentRunRequestSchema.parse({ agentId, intent });
      return apiRequest(
        `/api/v1/agents/${encodeURIComponent(agentId)}/runs`,
        agentRunResponseSchema,
        {
          body: JSON.stringify(request),
          headers: { "idempotency-key": idempotencyKey("agent-run") },
          method: "POST",
        },
        organizationId,
      );
    },
    onError: (cause) => setError(messageFrom(cause, "The agent run could not be completed.")),
    onSuccess: ({ run: completed }) => {
      setError("");
      setRun(completed);
    },
  });
  const manual = useMutation({
    mutationFn: async () => {
      const request = createManualAgentRunRequestSchema.parse({
        agentId,
        serviceId: manualServiceId,
      });
      return apiRequest(
        `/api/v1/agents/${encodeURIComponent(agentId)}/runs/manual`,
        agentRunResponseSchema,
        {
          body: JSON.stringify(request),
          headers: { "idempotency-key": idempotencyKey("manual-run") },
          method: "POST",
        },
        organizationId,
      );
    },
    onError: (cause) => setError(messageFrom(cause, "The manual fallback could not be completed.")),
    onSuccess: ({ run: completed }) => {
      setError("");
      setRun(completed);
    },
  });
  const transact = useMutation({
    mutationFn: async () => {
      if (run?.proposal === null || run === null) throw new Error("A signed proposal is required.");
      const prepared = await apiRequest(
        "/api/v1/purchase-preparations",
        purchasePreparationResponseSchema,
        {
          body: JSON.stringify(purchasePreparationRequestSchema.parse({ agentRunId: run.id })),
          headers: { "idempotency-key": idempotencyKey("purchase-preparation") },
          method: "POST",
        },
        organizationId,
      );
      return apiRequest(
        "/api/v1/transactions",
        transactionProposalResponseSchema,
        {
          body: JSON.stringify(prepared.transactionRequest),
          headers: { "idempotency-key": idempotencyKey("transaction") },
          method: "POST",
        },
        organizationId,
      );
    },
    onError: (cause) =>
      setError(messageFrom(cause, "The proposal could not enter policy evaluation.")),
    onSuccess: (result) => router.push(`/app/transactions/${result.transactionId}`),
  });

  if (agents.isLoading || services.isLoading)
    return <Loading label="Opening the controlled workspace" />;
  if (
    agents.isError ||
    services.isError ||
    agents.data === undefined ||
    services.data === undefined
  ) {
    return <Alert tone="error">Agents or the verified service catalog could not be loaded.</Alert>;
  }
  if (agents.data.agents.length === 0) {
    return (
      <EmptyState
        action={
          <ButtonLink href="/app/agents/new" tone="signal">
            Create an agent
          </ButtonLink>
        }
        body="The workspace executes only a published, versioned agent with explicitly bound tools."
        title="Agent identity required"
      />
    );
  }
  if (publishedAgents.length === 0) {
    return (
      <EmptyState
        action={
          <ButtonLink href={`/app/agents/${agents.data.agents[0]?.id ?? ""}`} tone="signal">
            Publish a version
          </ButtonLink>
        }
        body="Create and publish one immutable version before asking the agent to search or propose."
        title="Publish an agent version"
      />
    );
  }

  const pending = start.isPending || manual.isPending;
  return (
    <>
      <div className="page-title">
        <div>
          <h1 className="balance">Agent workspace</h1>
          <p>
            Language models interpret intent. Signed tools assemble proposals. Policy alone decides
            authority.
          </p>
        </div>
        <div className="page-actions">
          <StatusBadge status={run?.status ?? "READY"} />
        </div>
      </div>
      <div className="workspace-grid">
        <form
          className="panel panel-body stack"
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            setRun(null);
            start.mutate();
          }}
        >
          <div className="field">
            <label htmlFor="run-agent">Published agent</label>
            <select
              className="select"
              id="run-agent"
              onChange={(event) => setAgentId(event.target.value)}
              value={agentId}
            >
              {publishedAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="run-intent">What should the agent find?</label>
            <textarea
              className="textarea workspace-intent"
              id="run-intent"
              maxLength={1000}
              minLength={5}
              onChange={(event) => setIntent(event.target.value)}
              placeholder="Find the best-value verified business research service under ₹500."
              required
              value={intent}
            />
            <small>
              The model receives this intent, never payment credentials or expanded authority.
            </small>
          </div>
          {error === "" ? null : <Alert tone="error">{error}</Alert>}
          <button
            className="button button-signal"
            disabled={pending || agentId === ""}
            type="submit"
          >
            <Bot size={16} />
            {start.isPending ? "Running bounded tools…" : "Run agent"}
            <ArrowRight size={15} />
          </button>
          <div className="authority-note">
            <ShieldCheck size={16} />
            <span>
              <strong>No payment authority here.</strong> A successful proposal still passes
              mandate, risk, budget, and signature checks.
            </span>
          </div>
        </form>
        <RunLedger pending={pending} run={run} />
      </div>

      {run?.manualFallbackAvailable ? (
        <Panel title="Model unavailable · deterministic fallback">
          <div className="form-grid">
            <div className="field">
              <label htmlFor="fallback-service">Currently verified service</label>
              <select
                className="select"
                id="fallback-service"
                onChange={(event) => setManualServiceId(event.target.value)}
                value={manualServiceId}
              >
                <option value="">Choose a verified service</option>
                {services.data.services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name} · {formatInr(service.priceSubunits)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <span className="field-label">Fallback boundary</span>
              <p className="muted">
                Uses the same signed catalog and tool scopes without asking another model.
              </p>
            </div>
          </div>
          <div className="form-actions">
            <button
              className="button button-secondary"
              disabled={manual.isPending || manualServiceId === ""}
              onClick={() => manual.mutate()}
              type="button"
            >
              <Wrench size={15} />
              {manual.isPending ? "Building proposal…" : "Use manual fallback"}
            </button>
          </div>
        </Panel>
      ) : null}

      {run?.proposal === null || run === null ? null : (
        <section className="proposal-ribbon">
          <div>
            <span className="metric-label">Signed purchase proposal</span>
            <strong>{run.proposal.service.name}</strong>
            <p>{run.proposal.decisionSummary}</p>
          </div>
          <div className="proposal-amount data">{formatInr(run.proposal.amountSubunits)}</div>
          <button
            className="button button-signal"
            disabled={transact.isPending}
            onClick={() => transact.mutate()}
            type="button"
          >
            {transact.isPending ? "Evaluating authority…" : "Evaluate under mandate"}
            <ArrowRight size={15} />
          </button>
        </section>
      )}
    </>
  );
}

function RunLedger({ pending, run }: Readonly<{ pending: boolean; run: AgentRun | null }>) {
  if (pending) {
    return (
      <section className="panel run-ledger">
        <div className="panel-head">
          <h2>Execution register</h2>
          <StatusBadge status="RUNNING" />
        </div>
        <Loading label="Gemini is interpreting intent; approved tools execute server-side" />
      </section>
    );
  }
  if (run === null) {
    return (
      <section className="panel run-ledger">
        <div className="panel-head">
          <h2>Execution register</h2>
          <StatusBadge status="NOT_STARTED" />
        </div>
        <EmptyState
          body="Run events, bounded tool calls, hashes, and the final proposal will settle here."
          title="Awaiting an intent"
        />
      </section>
    );
  }
  return (
    <section className="panel run-ledger">
      <div className="panel-head">
        <h2>Execution register · {shortId(run.id)}</h2>
        <StatusBadge status={run.status} />
      </div>
      <div className="panel-body">
        <ol className="timeline">
          {run.events.map((event) => (
            <li key={`${event.sequence}-${event.payloadHash}`}>
              <span className="timeline-mark">
                <CircleDot size={13} />
              </span>
              <div className="timeline-content">
                <strong>{humanize(event.type)}</strong>
                <p>
                  {formatDate(event.createdAt)} · sequence {event.sequence} ·{" "}
                  {shortId(event.payloadHash)}
                </p>
              </div>
            </li>
          ))}
        </ol>
        {run.toolCalls.length === 0 ? null : (
          <div className="tool-register">
            {run.toolCalls.map((call) => (
              <div className="tool-line" key={call.id}>
                <span className="data">{call.toolVersionId}</span>
                <StatusBadge status={call.status} />
                <span className="mono-id">
                  {call.latencyMs === null ? "—" : `${call.latencyMs}ms`}
                </span>
              </div>
            ))}
          </div>
        )}
        {run.failureCode === null ? null : (
          <Alert tone={run.manualFallbackAvailable ? "warning" : "error"}>
            {humanize(run.failureCode)}
          </Alert>
        )}
      </div>
    </section>
  );
}

function messageFrom(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}
