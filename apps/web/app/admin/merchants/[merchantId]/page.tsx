import { MerchantReviewDetail } from "@/components/admin-console";

export default async function MerchantPage({
  params,
}: Readonly<{ params: Promise<{ merchantId: string }> }>) {
  const { merchantId } = await params;
  return <MerchantReviewDetail merchantId={merchantId} />;
}
