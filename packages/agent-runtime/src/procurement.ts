import {
  type MarketplaceService,
  type ProcurementIntent,
  procurementIntentSchema,
} from "@mindpay/contracts";

export function selectProcurementService(
  untrustedIntent: unknown,
  services: readonly MarketplaceService[],
): MarketplaceService | null {
  const intent = procurementIntentSchema.parse(untrustedIntent);
  const eligible = services.filter(
    (service) =>
      service.availability === "available" &&
      service.category === intent.category &&
      service.currency === intent.currency &&
      service.priceSubunits <= intent.maximumPriceSubunits &&
      service.merchant.verificationStatus === "APPROVED" &&
      service.merchant.verificationTier === "TEST_VERIFIED",
  );
  eligible.sort((left, right) => compareServices(intent, left, right));
  return eligible[0] ?? null;
}

export function procurementDecisionSummary(
  intent: ProcurementIntent,
  service: MarketplaceService,
): string {
  const amount = new Intl.NumberFormat("en-IN", {
    currency: "INR",
    style: "currency",
  }).format(service.priceSubunits / 100);
  return `${service.name} is a currently verified ${service.category.replaceAll("_", " ")} service at ${amount}, within the stated budget and selected using ${intent.preference.toLocaleLowerCase("en-US").replaceAll("_", " ")}.`;
}

function compareServices(
  intent: ProcurementIntent,
  left: MarketplaceService,
  right: MarketplaceService,
): number {
  if (intent.preference === "FASTEST_DELIVERY") {
    const delivery =
      left.fulfilment.estimatedDeliverySeconds - right.fulfilment.estimatedDeliverySeconds;
    if (delivery !== 0) return delivery;
  }
  const price = left.priceSubunits - right.priceSubunits;
  if (price !== 0) return price;
  const delivery =
    left.fulfilment.estimatedDeliverySeconds - right.fulfilment.estimatedDeliverySeconds;
  if (delivery !== 0) return delivery;
  return left.id.localeCompare(right.id, "en-US");
}
