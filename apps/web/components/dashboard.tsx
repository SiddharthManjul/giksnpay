"use client";

import {
  agentsResponseSchema,
  mandatesResponseSchema,
  transactionsResponseSchema,
} from "@mindpay/contracts";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { formatDate, formatInr, shortId } from "@/lib/format";
import { useWorkspaceSession } from "@/lib/workspace";
import { Alert, ButtonLink, EmptyState, Loading, StatusBadge } from "./ui";

export function Dashboard() {
  const { organizationId, membership } = useWorkspaceSession();
  const enabled = organizationId !== null;
  const transactions = useQuery({
    queryKey: ["transactions", organizationId],
    queryFn: () =>
      apiRequest("/api/v1/transactions", transactionsResponseSchema, {}, organizationId),
    enabled,
  });
  const agents = useQuery({
    queryKey: ["agents", organizationId],
    queryFn: () => apiRequest("/api/v1/agents", agentsResponseSchema, {}, organizationId),
    enabled,
  });
  const mandates = useQuery({
    queryKey: ["mandates", organizationId],
    queryFn: () => apiRequest("/api/v1/mandates", mandatesResponseSchema, {}, organizationId),
    enabled,
  });
  if (transactions.isLoading || agents.isLoading || mandates.isLoading)
    return <Loading label="Reconciling workspace totals" />;
  if (
    transactions.isError ||
    agents.isError ||
    mandates.isError ||
    transactions.data === undefined ||
    agents.data === undefined ||
    mandates.data === undefined
  )
    return (
      <Alert tone="error">
        The workspace ledger could not be loaded. Reconnect to the gateway and refresh.
      </Alert>
    );
  const activeMandates = mandates.data.mandates.filter((entry) => entry.status === "ACTIVE");
  const controlled = transactions.data.transactions.reduce(
    (sum, transaction) => sum + transaction.amountSubunits,
    0,
  );
  const complete = transactions.data.transactions.filter(
    (transaction) => transaction.state === "EVIDENCE_READY",
  ).length;
  return (
    <>
      <div className="page-title">
        <div>
          <h1 className="balance">Transaction authority.</h1>
          <p>{membership?.organization.name} · canonical server state</p>
        </div>
      </div>
      <section className="panel ledger-lead">
        <div className="panel-head">
          <h2>Transaction ledger</h2>
          <Link className="row-link" href="/app/workspace">
            Start a controlled purchase
          </Link>
        </div>
        {transactions.data.transactions.length === 0 ? (
          <EmptyState
            action={
              <ButtonLink href="/app/workspace" tone="signal">
                Open agent workspace
              </ButtonLink>
            }
            body="Transactions appear only after a real proposal enters deterministic policy evaluation."
            title="No transactions yet"
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Transaction</th>
                  <th>Merchant</th>
                  <th>Amount</th>
                  <th>State</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {transactions.data.transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>
                      <Link className="row-link data" href={`/app/transactions/${transaction.id}`}>
                        {shortId(transaction.id)}
                      </Link>
                    </td>
                    <td>{transaction.merchantId}</td>
                    <td className="data">{formatInr(transaction.amountSubunits)}</td>
                    <td>
                      <StatusBadge status={transaction.state} />
                    </td>
                    <td>{formatDate(transaction.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="metric-strip">
        <Metric label="Controlled volume" value={formatInr(controlled)} />
        <Metric label="Transactions" value={String(transactions.data.transactions.length)} />
        <Metric label="Active mandates" value={String(activeMandates.length)} />
        <Metric label="Evidence ready" value={String(complete)} />
      </div>
      <section aria-labelledby="action-register-title" className="panel">
        <div className="panel-head">
          <h2 id="action-register-title">Authority register</h2>
          <span className="muted">Configuration paths</span>
        </div>
        <div className="action-register">
          <RegisterAction
            detail={`${agents.data.agents.length} configured`}
            href="/app/agents/new"
            index="01"
            label="Create an agent"
          />
          <RegisterAction
            detail={`${activeMandates.length} active`}
            href="/app/mandates/new"
            index="02"
            label="Set a mandate"
          />
          <RegisterAction
            detail="Verified catalog"
            href="/app/marketplace"
            index="03"
            label="Browse trusted supply"
          />
        </div>
      </section>
    </>
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
function RegisterAction({
  detail,
  href,
  index,
  label,
}: Readonly<{ detail: string; href: string; index: string; label: string }>) {
  return (
    <Link className="action-register-row" href={href}>
      <span aria-hidden="true" className="authority-index">
        {index}
      </span>
      <strong>{label}</strong>
      <span className="muted">{detail}</span>
      <ArrowRight aria-hidden="true" size={16} />
    </Link>
  );
}
