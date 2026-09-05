import { Suspense } from "react";
import { AgentWorkspace } from "@/components/agent-workspace";
import { Loading } from "@/components/ui";

export default function WorkspacePage() {
  return (
    <Suspense fallback={<Loading label="Opening the controlled workspace" />}>
      <AgentWorkspace />
    </Suspense>
  );
}
