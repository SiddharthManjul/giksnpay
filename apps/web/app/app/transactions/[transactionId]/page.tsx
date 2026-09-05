import { TransactionControl } from "@/components/transaction-control";

export default async function TransactionPage({
  params,
}: Readonly<{ params: Promise<{ transactionId: string }> }>) {
  const { transactionId } = await params;
  return <TransactionControl transactionId={transactionId} />;
}
