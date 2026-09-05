"use client";

import { marketplaceServiceResponseSchema, merchantTrustResponseSchema } from "@mindpay/contracts";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ExternalLink, ShieldCheck } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { formatDate, formatInr } from "@/lib/format";
import { Alert, ButtonLink, Loading, Panel, StatusBadge } from "./ui";

export function ServiceDetail({ serviceId }: Readonly<{ serviceId: string }>) {
  const service = useQuery({
    queryKey: ["service", serviceId],
    queryFn: () =>
      apiRequest(
        `/api/v1/marketplace/services/${encodeURIComponent(serviceId)}`,
        marketplaceServiceResponseSchema,
      ),
    retry: false,
  });
  const trust = useQuery({
    queryKey: ["service-merchant", service.data?.service.merchant.id],
    queryFn: () =>
      apiRequest(
        `/api/v1/marketplace/merchants/${encodeURIComponent(service.data?.service.merchant.id ?? "")}`,
        merchantTrustResponseSchema,
      ),
    enabled: service.data !== undefined,
    retry: false,
  });
  if (service.isLoading) return <Loading label="Reading immutable service version" />;
  if (service.isError || service.data === undefined)
    return (
      <Alert tone="error">
        This verified service is no longer available. Return to the marketplace to choose a current
        version.
      </Alert>
    );
  const value = service.data.service;
  return (
    <>
      <div className="page-title">
        <div>
          <h1 className="balance">{value.name}</h1>
          <p>{value.description}</p>
        </div>
        <div className="page-actions">
          <ButtonLink href={`/app/workspace?service=${encodeURIComponent(value.id)}`} tone="signal">
            Use in agent run <ArrowRight size={15} />
          </ButtonLink>
        </div>
      </div>
      <div className="metric-strip">
        <Metric label="Exact price" value={formatInr(value.priceSubunits)} />
        <Metric label="Version" value={value.version} />
        <Metric label="Protocol" value={value.protocol} />
        <Metric label="Delivery" value={`~${value.fulfilment.estimatedDeliverySeconds}s`} />
      </div>
      <div className="grid-2">
        <Panel title="Service contract">
          <dl className="ledger-list">
            <Fact label="External service" value={value.externalId} />
            <Fact label="Category" value={value.category} />
            <Fact label="Payment rail" value={value.paymentRail} />
            <Fact label="Fulfilment tool" value={value.fulfilment.toolId} />
            <Fact label="Availability" value={value.availability} />
          </dl>
          <div className="service-meta">
            <a
              className="row-link"
              href={value.policyLinks.termsUrl}
              rel="noreferrer"
              target="_blank"
            >
              Terms <ExternalLink size={12} />
            </a>
            <a
              className="row-link"
              href={value.policyLinks.privacyUrl}
              rel="noreferrer"
              target="_blank"
            >
              Privacy <ExternalLink size={12} />
            </a>
          </div>
        </Panel>
        <Panel title="Merchant trust">
          {trust.isLoading ? (
            <Loading label="Checking merchant trust" />
          ) : trust.isError || trust.data === undefined ? (
            <Alert tone="error">Merchant trust details could not be verified.</Alert>
          ) : (
            <>
              <div
                style={{
                  alignItems: "center",
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 20,
                }}
              >
                <div>
                  <strong>{trust.data.merchant.name}</strong>
                  <p className="muted" style={{ margin: "4px 0 0" }}>
                    {trust.data.merchant.domain}
                  </p>
                </div>
                <StatusBadge status={trust.data.merchant.verificationStatus} />
              </div>
              <dl className="ledger-list">
                <Fact label="Tier" value={trust.data.merchant.verificationTier} />
                <Fact label="Risk" value={trust.data.merchant.riskTier} />
                <Fact label="Catalog" value={trust.data.merchant.catalogVersion} />
                <Fact
                  label="Verified"
                  value={
                    trust.data.merchant.verifiedAt === null
                      ? "Not verified"
                      : formatDate(trust.data.merchant.verifiedAt)
                  }
                />
                <Fact label="Protocols" value={trust.data.merchant.protocols.join(" · ")} />
              </dl>
              <p className="muted" style={{ fontSize: 12 }}>
                <ShieldCheck size={13} style={{ display: "inline", marginRight: 6 }} />
                {trust.data.merchant.checks.length} verification checks recorded
              </p>
            </>
          )}
        </Panel>
      </div>
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
function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="ledger-item" style={{ gridTemplateColumns: ".7fr 1.3fr", padding: "13px 0" }}>
      <dt className="muted">{label}</dt>
      <dd style={{ margin: 0, overflowWrap: "anywhere" }}>{value}</dd>
    </div>
  );
}
