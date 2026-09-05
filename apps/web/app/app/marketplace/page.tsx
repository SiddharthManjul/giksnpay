import { MarketplaceExplorer } from "@/components/marketplace-explorer";

export default function MarketplacePage() {
  return (
    <>
      <div className="page-title">
        <div>
          <h1 className="balance">Verified marketplace</h1>
          <p>Only currently approved merchant catalogs are rendered.</p>
        </div>
      </div>
      <MarketplaceExplorer appMode />
    </>
  );
}
