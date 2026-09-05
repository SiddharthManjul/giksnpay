import { AuthorityBoard } from "@/components/authority-board";
import { DemoLauncher } from "@/components/auth-actions";
import { Brand } from "@/components/public-shell";

export default function DemoPage() {
  return (
    <main className="section" id="main-content">
      <Brand />
      <div className="grid-2" style={{ alignItems: "center", marginTop: 70 }}>
        <div>
          <div className="page-title" style={{ display: "block" }}>
            <h1 className="balance">Follow one purchase from intent to proof.</h1>
            <p>
              The demo provisions real canonical state. It does not fake payment success or
              evidence: use Razorpay Test Mode and the running merchant worker for those
              transitions.
            </p>
          </div>
          <section className="panel">
            <div className="panel-body">
              <DemoLauncher />
            </div>
          </section>
        </div>
        <AuthorityBoard />
      </div>
    </main>
  );
}
