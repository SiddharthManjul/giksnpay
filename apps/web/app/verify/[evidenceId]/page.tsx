import { PublicShell } from "@/components/public-shell";
import { EvidenceVerifier } from "@/components/verify-evidence";

export default async function EvidencePage({
  params,
}: Readonly<{ params: Promise<{ evidenceId: string }> }>) {
  const { evidenceId } = await params;
  return (
    <PublicShell>
      <main className="section" id="main-content">
        <div className="section-heading">
          <h1 className="balance">Evidence verification</h1>
          <p className="data">{evidenceId}</p>
        </div>
        <EvidenceVerifier evidenceId={evidenceId} />
      </main>
    </PublicShell>
  );
}
