import { PublicShell } from "@/components/public-shell";
import { VerifyEntry } from "@/components/verify-evidence";

export default function VerifyPage() {
  return (
    <PublicShell>
      <main className="section" id="main-content">
        <div className="section-heading">
          <h1 className="balance">Trust the proof, not the screenshot.</h1>
          <p>
            Public verification recomputes the bundle hash, platform signature, audit links,
            merchant and delivery attestations, and the public redaction boundary.
          </p>
        </div>
        <div style={{ maxWidth: 720 }}>
          <VerifyEntry />
        </div>
      </main>
    </PublicShell>
  );
}
