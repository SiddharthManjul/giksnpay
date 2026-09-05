"use client";

import { marketplaceServicesResponseSchema } from "@mindpay/contracts";
import { useQuery } from "@tanstack/react-query";
import { Clock3, Radio, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { apiRequest } from "@/lib/api";
import { formatInr } from "@/lib/format";
import { Alert, EmptyState, Loading, StatusBadge } from "./ui";

export function MarketplaceExplorer({ appMode = false }: Readonly<{ appMode?: boolean }>) {
  const [query, setQuery] = useState("");
  const services = useQuery({
    queryKey: ["marketplace", query],
    queryFn: () =>
      apiRequest(
        `/api/v1/marketplace/services?limit=100${query.trim() === "" ? "" : `&q=${encodeURIComponent(query.trim())}`}`,
        marketplaceServicesResponseSchema,
      ),
  });
  return (
    <div className="stack">
      <div className="field">
        <label htmlFor="marketplace-search">Search verified services</label>
        <input
          className="input"
          id="marketplace-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Research, market snapshot, competitor…"
          type="search"
          value={query}
        />
      </div>
      {services.isLoading ? (
        <Loading label="Reading the verified catalog" />
      ) : services.isError || services.data === undefined ? (
        <Alert tone="error">
          The verified catalog is unavailable. Check that the gateway and SignalWorks workers are
          running, then retry.
        </Alert>
      ) : services.data.services.length === 0 ? (
        <EmptyState
          body="No currently verified service matches this search. Unverified catalog entries are intentionally excluded."
          title="No verified match"
        />
      ) : (
        <section aria-label="Verified services" className="panel">
          {services.data.services.map((service) => (
            <article className="service-row" key={service.id}>
              <div>
                <h3>
                  <Link
                    className="row-link"
                    href={`${appMode ? "/app" : ""}/marketplace/${service.id}`}
                  >
                    {service.name}
                  </Link>
                </h3>
                <p>{service.description}</p>
                <div className="service-meta">
                  <StatusBadge status={service.merchant.verificationStatus} />
                  <span className="badge state-neutral">
                    <ShieldCheck size={12} /> {service.merchant.name}
                  </span>
                  <span className="badge state-neutral">
                    <Radio size={12} /> {service.protocol} · {service.paymentRail}
                  </span>
                </div>
              </div>
              <div>
                <span className="metric-label">Fulfilment</span>
                <strong>{service.fulfilment.type.toUpperCase()}</strong>
                <p>
                  <Clock3 size={12} style={{ display: "inline", marginRight: 5 }} />
                  about {service.fulfilment.estimatedDeliverySeconds}s
                </p>
              </div>
              <div className="service-price data">{formatInr(service.priceSubunits)}</div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
