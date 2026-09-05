import { MarketplaceExplorer } from "@/components/marketplace-explorer";
import { PublicShell } from "@/components/public-shell";

export default function PublicMarketplacePage() {
  return (
    <PublicShell>
      <main className="section" id="main-content">
        <div className="section-heading">
          <h1 className="balance">Verified supply, with the receipt attached.</h1>
          <p>
            This catalog is read directly from MindPay. Entries disappear when merchant verification
            expires, a signature fails, or the service is retired.
          </p>
        </div>
        <MarketplaceExplorer />
      </main>
    </PublicShell>
  );
}
