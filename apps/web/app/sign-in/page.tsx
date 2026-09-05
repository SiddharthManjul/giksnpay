import Link from "next/link";
import { AuthorityBoard } from "@/components/authority-board";
import { SignInForm } from "@/components/auth-actions";
import { Brand } from "@/components/public-shell";

export default function SignInPage() {
  return (
    <main className="section" id="main-content">
      <Brand />
      <div className="grid-2" style={{ alignItems: "center", marginTop: 70 }}>
        <div>
          <div className="page-title" style={{ display: "block" }}>
            <h1 className="balance">Return to the control plane.</h1>
            <p>
              Sessions are HTTP-only and organization access is rechecked on every protected
              request.
            </p>
          </div>
          <section className="panel">
            <div className="panel-body">
              <SignInForm />
            </div>
          </section>
          <p className="muted" style={{ fontSize: 13, marginTop: 20 }}>
            Need an isolated walkthrough? <Link href="/demo">Open the demo instead.</Link>
          </p>
        </div>
        <AuthorityBoard />
      </div>
    </main>
  );
}
