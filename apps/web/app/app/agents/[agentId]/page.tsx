import { AgentDetail } from "@/components/agents";
export default async function AgentPage({
  params,
}: Readonly<{ params: Promise<{ agentId: string }> }>) {
  const { agentId } = await params;
  return <AgentDetail agentId={agentId} />;
}
