import { AgentAssuranceDetail } from "@/components/admin-console";

export default async function AdminAgentPage({
  params,
}: Readonly<{ params: Promise<{ agentId: string }> }>) {
  const { agentId } = await params;
  return <AgentAssuranceDetail agentId={agentId} />;
}
