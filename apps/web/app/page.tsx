import { ArrowRight, Fingerprint, LockKeyhole, ShieldCheck } from "lucide-react";
import { AuthorityBoard } from "@/components/authority-board";
import { PublicShell } from "@/components/public-shell";
import { ButtonLink } from "@/components/ui";

const safeguards = [
  [
    "Agents propose. Policy decides.",
    "Model output never controls payment, verification, entitlement, or audit authority.",
  ],
  [
    "Money moves under a mandate.",
    "Exact services, merchants, rails, budgets, thresholds, expiry, and attempt limits stay user-owned.",
  ],
  [
    "Every transition leaves proof.",
    "Signed append-only events become a portable evidence bundle that anyone can verify.",
  ],
] as const;

export default function HomePage() {
  return (
    <PublicShell>
      <main id="main-content">
        <section className="hero">
          <div className="hero-copy">
            <h1 className="balance">
              AI can act. <em>Money still needs authority.</em>
            </h1>
            <p>
              MindPay lets autonomous agents discover and buy useful services while deterministic
              code keeps control of approval, payment, fulfilment, and evidence.
            </p>
            <div className="hero-actions">
              <ButtonLink href="/demo" tone="signal">
                Run the controlled demo <ArrowRight size={16} />
              </ButtonLink>
              <ButtonLink href="/how-it-works" tone="secondary">
                Inspect the boundary
              </ButtonLink>
            </div>
            <div className="truth-line">
              <span>
                <ShieldCheck size={14} /> Verified merchants
              </span>
              <span>
                <Fingerprint size={14} /> Passkey approval
              </span>
              <span>
                <LockKeyhole size={14} /> No card data stored
              </span>
            </div>
          </div>
          <AuthorityBoard />
        </section>
        <section className="section">
          <div className="section-heading">
            <h2 className="balance">A control plane, not another wallet.</h2>
            <p>
              The agent handles language and discovery. The authority rail below handles facts:
              signatures, exact integers, legal transitions, and a proof chain that cannot be
              rewritten after the result.
            </p>
          </div>
          <div className="ledger-list">
            {safeguards.map(([title, body]) => (
              <article className="ledger-item" key={title}>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
