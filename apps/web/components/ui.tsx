import { AlertTriangle, Check, CircleDashed, Info, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ButtonLink({
  children,
  href,
  tone = "primary",
}: Readonly<{ children: ReactNode; href: string; tone?: "primary" | "secondary" | "signal" }>) {
  return (
    <Link className={cn("button", `button-${tone}`)} href={href}>
      {children}
    </Link>
  );
}

export function StatusBadge({ status }: Readonly<{ status: string }>) {
  const normalized = status.toUpperCase();
  const pass = [
    "ACTIVE",
    "ALLOW",
    "APPROVED",
    "CAPTURED",
    "COMPLETED",
    "EVIDENCE_READY",
    "PASSED",
    "READY",
    "SIGNED",
    "SUCCEEDED",
    "VERIFIED",
  ].some((value) => normalized.includes(value));
  const fail = ["BLOCK", "FAILED", "QUARANTINED", "REVOKED", "SUSPENDED"].some((value) =>
    normalized.includes(value),
  );
  const warn = ["PENDING", "REVIEW", "RECONCILING", "REQUIRED", "DRAFT"].some((value) =>
    normalized.includes(value),
  );
  const Icon = pass ? Check : fail ? X : warn ? AlertTriangle : CircleDashed;
  const tone = pass ? "state-pass" : fail ? "state-fail" : warn ? "state-warn" : "state-neutral";
  return (
    <span className={cn("badge", tone)}>
      <Icon aria-hidden="true" />
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function Panel({
  children,
  title,
  action,
}: Readonly<{ action?: ReactNode; children: ReactNode; title?: string }>) {
  return (
    <section className="panel">
      {title === undefined ? null : (
        <div className="panel-head">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function Loading({ label = "Loading verified state" }: Readonly<{ label?: string }>) {
  return (
    <div aria-live="polite" className="loading" role="status">
      <span aria-hidden="true" className="spinner" />
      {label}…
    </div>
  );
}

export function EmptyState({
  action,
  body,
  title,
}: Readonly<{ action?: ReactNode; body: string; title: string }>) {
  return (
    <div className="empty">
      <span aria-hidden="true" className="empty-icon">
        <ShieldCheck />
      </span>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function Alert({
  children,
  tone = "info",
}: Readonly<{ children: ReactNode; tone?: "error" | "info" | "success" | "warning" }>) {
  const Icon =
    tone === "error" || tone === "warning" ? AlertTriangle : tone === "success" ? Check : Info;
  return (
    <div className={cn("alert", `alert-${tone}`)} role={tone === "error" ? "alert" : "status"}>
      <Icon aria-hidden="true" size={18} />
      <div>{children}</div>
    </div>
  );
}
