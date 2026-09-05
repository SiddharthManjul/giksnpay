"use client";

import {
  type Agent,
  agentsResponseSchema,
  type MandateResponse,
  mandatesResponseSchema,
} from "@mindpay/contracts";
import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  Boxes,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Settings,
  ShieldCheck,
  Store,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { API_ORIGIN, apiRequest } from "@/lib/api";
import { useWorkspaceSession } from "@/lib/workspace";
import { Alert, ButtonLink, Loading } from "./ui";
import { Brand } from "./public-shell";

const primary = [
  ["Overview", "/app", LayoutDashboard],
  ["Marketplace", "/app/marketplace", Store],
  ["Agents", "/app/agents", Bot],
  ["Mandates", "/app/mandates", ScrollText],
  ["Workspace", "/app/workspace", Wrench],
  ["Settings", "/app/settings", Settings],
] as const;

export function WorkspaceShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const { hydrated, me, membership, organizationId } = useWorkspaceSession();
  const agents = useQuery({
    queryKey: ["agents", organizationId],
    queryFn: () => apiRequest("/api/v1/agents", agentsResponseSchema, {}, organizationId),
    enabled: organizationId !== null,
  });
  const mandates = useQuery({
    queryKey: ["mandates", organizationId],
    queryFn: () => apiRequest("/api/v1/mandates", mandatesResponseSchema, {}, organizationId),
    enabled: organizationId !== null,
  });
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  async function signOut() {
    await fetch(`${API_ORIGIN}/api/auth/sign-out`, { credentials: "include", method: "POST" });
    router.push("/sign-in");
    router.refresh();
  }
  if (me.isLoading || !hydrated)
    return (
      <main className="section" id="main-content">
        <Loading label="Opening your workspace" />
      </main>
    );
  if (me.isError || me.data === undefined)
    return (
      <main className="section" id="main-content">
        <Alert tone="error">Your session could not be verified. Sign in again to continue.</Alert>
        <div style={{ marginTop: 18 }}>
          <ButtonLink href="/sign-in">Sign in</ButtonLink>
        </div>
      </main>
    );
  if (organizationId === null || membership === null)
    return (
      <main className="section" id="main-content">
        <Alert tone="warning">This account has no active workspace.</Alert>
        <div style={{ marginTop: 18 }}>
          <ButtonLink href="/demo" tone="signal">
            Create a demo workspace
          </ButtonLink>
        </div>
      </main>
    );
  const canReview = membership.access.capabilities.includes("merchant:review");
  const nextAction = resolveNextAction(agents.data, mandates.data);
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Workspace navigation" className="sidebar-nav">
          {primary.map(([label, href, Icon]) => (
            <Link
              aria-current={isCurrent(pathname, href) ? "page" : undefined}
              href={href}
              key={href}
            >
              <Icon size={17} />
              {label}
            </Link>
          ))}
          {canReview ? (
            <>
              <Link
                aria-current={pathname.startsWith("/admin/merchants") ? "page" : undefined}
                href="/admin/merchants"
              >
                <Boxes size={17} />
                Merchant review
              </Link>
              <Link
                aria-current={pathname.startsWith("/admin/agents") ? "page" : undefined}
                href="/admin/agents"
              >
                <Bot size={17} />
                Agent assurance
              </Link>
              <Link
                aria-current={pathname.startsWith("/admin/incidents") ? "page" : undefined}
                href="/admin/incidents"
              >
                <ShieldCheck size={17} />
                Incidents
              </Link>
            </>
          ) : null}
        </nav>
        <div className="sidebar-foot">
          <span className="workspace-name">{membership.organization.name}</span>
          <span className="workspace-role">
            {membership.access.role} · {me.data.user.name}
          </span>
          <button
            className="button button-quiet"
            onClick={signOut}
            style={{ marginTop: 10, paddingLeft: 0 }}
            type="button"
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </aside>
      <div className="app-column">
        <header className="topbar">
          <span className="topbar-title">{pageTitle(pathname)}</span>
          <div className="topbar-actions">
            <span className={online ? "connection" : "connection offline"}>
              {online ? "Browser online" : "Browser offline · state may be stale"}
            </span>
            {nextAction === null ? null : (
              <ButtonLink href={nextAction.href} tone="signal">
                {nextAction.label}
              </ButtonLink>
            )}
          </div>
        </header>
        <main className="app-main" id="main-content">
          {children}
        </main>
      </div>
      <nav aria-label="Mobile workspace navigation" className="mobile-bar">
        {primary.slice(0, 5).map(([label, href, Icon]) => (
          <Link
            aria-current={isCurrent(pathname, href) ? "page" : undefined}
            href={href}
            key={href}
          >
            <Icon size={17} />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function isCurrent(pathname: string, href: string): boolean {
  return href === "/app" ? pathname === href : pathname.startsWith(href);
}
function pageTitle(pathname: string): string {
  if (pathname.includes("transactions")) return "Transaction control";
  if (pathname.includes("evidence") || pathname.startsWith("/verify")) return "Evidence verifier";
  if (pathname.startsWith("/admin")) return "Administration";
  return primary.find(([, href]) => isCurrent(pathname, href))?.[0] ?? "MindPay";
}

function resolveNextAction(
  agents: { readonly agents: readonly Agent[] } | undefined,
  mandates: { readonly mandates: readonly MandateResponse[] } | undefined,
): Readonly<{ href: string; label: string }> | null {
  if (agents === undefined || mandates === undefined) return null;
  if (agents.agents.length === 0) return { href: "/app/agents/new", label: "Create agent" };
  const published = agents.agents.filter((agent) => agent.currentVersionId !== null);
  if (published.length === 0) {
    const first = agents.agents[0];
    return first === undefined ? null : { href: `/app/agents/${first.id}`, label: "Publish agent" };
  }
  const active = mandates.mandates.filter((entry) => entry.status === "ACTIVE");
  const hasRunnableMandatePair = published.some(
    (agent) =>
      active.some(
        (entry) =>
          entry.mandate.schema_version === "mindpay.mandate.checkout.open.1" &&
          entry.mandate.agent.agent_id === agent.id,
      ) &&
      active.some(
        (entry) =>
          entry.mandate.schema_version === "mindpay.mandate.payment.open.1" &&
          entry.mandate.agent.agent_id === agent.id,
      ),
  );
  if (!hasRunnableMandatePair) {
    return { href: "/app/mandates/new", label: "Set mandate" };
  }
  return { href: "/app/workspace", label: "Start controlled run" };
}
