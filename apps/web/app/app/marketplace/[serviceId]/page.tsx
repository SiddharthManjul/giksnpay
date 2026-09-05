import { ServiceDetail } from "@/components/service-detail";

export default async function ServicePage({
  params,
}: Readonly<{ params: Promise<{ serviceId: string }> }>) {
  const { serviceId } = await params;
  return <ServiceDetail serviceId={serviceId} />;
}
