"use client";

import { evidenceIdSchema, publicEvidenceBundleSchema } from "@mindpay/contracts";
import { useQuery } from "@tanstack/react-query";
import { Download, Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { API_ORIGIN, apiRequest } from "@/lib/api";
import { formatDate, formatInr, humanize, shortId } from "@/lib/format";
import { Alert, Loading, Panel, StatusBadge } from "./ui";

export function VerifyEntry() {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = evidenceIdSchema.safeParse(value.trim());
    if (!parsed.success) {
      setError("Enter an evidence ID beginning with evd_ followed by its complete identifier.");
      return;
    }
    router.push(`/verify/${parsed.data}`);
  }
  return (
    <form className="panel panel-body stack" onSubmit={submit}>
      <div className="field">
        <label htmlFor="evidence-id">Evidence ID</label>
        <input
          aria-describedby={error === "" ? undefined : "evidence-error"}
          className="input data"
          id="evidence-id"
          onChange={(event) => {
            setValue(event.target.value);
            setError("");
          }}
          placeholder="evd_01…"
          value={value}
        />
      </div>
      {error === "" ? null : (
        <Alert tone="error">
          <span id="evidence-error">{error}</span>
        </Alert>
      )}
      <div className="form-actions">
        <button className="button button-signal" type="submit">
          Verify bundle <Link2 size={15} />
        </button>
      </div>
    </form>
  );
}

export function EvidenceVerifier({ evidenceId }: Readonly<{ evidenceId: string }>) {
  const evidence = useQuery({
    queryKey: ["evidence", evidenceId],
    queryFn: () =>
      apiRequest(`/api/v1/evidence/${encodeURIComponent(evidenceId)}`, publicEvidenceBundleSchema),
    retry: false,
  });
  if (evidence.isLoading) return <Loading label="Recomputing every proof" />;
  if (evidence.isError || evidence.data === undefined)
    return (
      <Alert tone="error">
        This evidence bundle was not found or could not be verified. Confirm the complete ID and try
        again.
      </Alert>
    );
  const bundle = evidence.data.bundle;
  return (
    <div className="stack">
      <Alert tone={evidence.data.verified ? "success" : "error"}>
        <strong>
          {evidence.data.verified
            ? "All available proofs verified."
            : "Verification failed closed."}
        </strong>
        <br />
        Checked independently at {formatDate(evidence.data.verifiedAt)}.
      </Alert>
      <Panel
        action={
          <a
            className="button button-secondary"
            href={`${API_ORIGIN}/api/v1/evidence/${evidenceId}/download`}
          >
            <Download size={14} /> Download redacted JSON
          </a>
        }
        title="Proof register"
      >
        <div className="proof-grid">
          {evidence.data.proofResults.map((proof) => (
            <div className="proof" key={proof.type}>
              <strong>{proof.label}</strong>
              <StatusBadge status={proof.status} />
              <p className="mono-id">{proof.code}</p>
            </div>
          ))}
        </div>
      </Panel>
      {bundle === null ? (
        <Alert tone="error">
          The stored document did not pass its schema boundary, so no untrusted bundle fields are
          rendered.
        </Alert>
      ) : (
        <div className="grid-2">
          <Panel title="Settlement">
            <dl className="ledger-list">
              <Fact label="Transaction" value={shortId(bundle.transaction.transaction_id)} />
              <Fact label="Outcome" value={humanize(bundle.transaction.state)} />
              <Fact label="Amount" value={formatInr(bundle.transaction.amount_subunits)} />
              <Fact label="Merchant" value={bundle.merchant.merchant_id} />
            </dl>
          </Panel>
          <Panel title="Chain anchors">
            <dl className="ledger-list">
              <Fact label="Events" value={String(bundle.audit.event_count)} />
              <Fact label="Root" value={shortId(bundle.audit.root_event_hash)} />
              <Fact label="Final" value={shortId(bundle.audit.final_event_hash)} />
              <Fact label="Signing key" value={bundle.kid} />
            </dl>
          </Panel>
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="ledger-item" style={{ gridTemplateColumns: ".65fr 1.35fr", padding: "13px 0" }}>
      <dt className="muted">{label}</dt>
      <dd className="data" style={{ margin: 0, overflowWrap: "anywhere" }}>
        {value}
      </dd>
    </div>
  );
}
