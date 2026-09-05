import { ArrowUpRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function Brand() {
  return (
    <Link className="brand" href="/">
      <span aria-hidden="true" className="brand-mark">
        <ShieldCheck size={17} />
      </span>
      mindpay
    </Link>
  );
}

export function PublicShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="public-shell">
      <header className="public-nav">
        <Brand />
        <nav aria-label="Public navigation" className="public-links">
          <Link href="/how-it-works">How it works</Link>
          <Link href="/marketplace">Marketplace</Link>
          <Link href="/verify">Verify evidence</Link>
          <Link className="button button-primary" href="/demo">
            Open demo <ArrowUpRight size={15} />
          </Link>
        </nav>
      </header>
      {children}
      <footer className="public-footer">
        <span>
          <Brand />
        </span>
        <span className="muted">
          Deterministic authority for agent commerce · Razorpay Test Mode
        </span>
      </footer>
    </div>
  );
}
