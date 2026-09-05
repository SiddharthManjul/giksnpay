import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
