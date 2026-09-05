import { PublicShell } from "@/components/public-shell";
import { AuthorityBoard } from "@/components/authority-board";

const sequence = [
  [
    "Discover verified supply",
    "Only services from currently approved merchants enter discovery. Catalog and signing-key changes trigger verification again.",
  ],
  [
    "Close authority",
    "An open user mandate becomes transaction-specific authority bound to one offer, checkout hash, payee, amount, rail, and attempt number.",
  ],
  [
    "Evaluate deterministic policy",
    "The policy and risk engines compare actual facts to the mandate. An AI explanation can describe the decision; it cannot change it.",
  ],
  [
    "Reserve, then pay",
    "Budget is reserved atomically before a Razorpay Test Mode order is created. Failure releases it; captured reconciliation commits it.",
  ],
  [
    "Redeem once, prove forever",
    "A short-lived entitlement redeems once through MCP. The signed merchant receipt closes a hash-linked public evidence bundle.",
  ],
] as const;

export default function HowItWorksPage() {
  return (
    <PublicShell>
      <main id="main-content">
        <section className="section">
          <div className="section-heading">
            <h1 className="balance">The boundary is the product.</h1>
            <p>
              MindPay deliberately separates an agent’s useful judgment from the code paths that can
              authorize money. Here is the exact route a purchase takes.
            </p>
          </div>
          <div className="grid-2">
            <AuthorityBoard />
            <div className="ledger-list">
              {sequence.map(([title, body]) => (
                <article className="ledger-item" key={title} style={{ gridTemplateColumns: "1fr" }}>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
