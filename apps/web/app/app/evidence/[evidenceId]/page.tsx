import { EvidenceVerifier } from "@/components/verify-evidence";

export default async function EvidencePage({
  params,
}: Readonly<{ params: Promise<{ evidenceId: string }> }>) {
  const { evidenceId } = await params;
  return (
    <>
      <div className="page-title">
        <div>
          <h1>Evidence verifier</h1>
          <p className="data">{evidenceId}</p>
        </div>
      </div>
      <EvidenceVerifier evidenceId={evidenceId} />
    </>
  );
}
