"use client";

import { meResponseSchema, provisionDemoWorkspaceResponseSchema } from "@mindpay/contracts";
import { ArrowRight, KeyRound, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { API_ORIGIN, apiRequest, idempotencyKey, storeWorkspaceId } from "@/lib/api";
import { Alert } from "./ui";

async function authPost(path: string, body: unknown): Promise<void> {
  const response = await fetch(`${API_ORIGIN}/api/auth/${path}`, {
    body: JSON.stringify(body),
    credentials: "include",
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) throw new Error("The account credentials were not accepted.");
}

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await authPost("sign-in/email", { email, password });
      const me = await apiRequest("/api/v1/me", meResponseSchema);
      const membership = me.organizations[0];
      if (membership === undefined) {
        router.push("/demo");
        return;
      }
      storeWorkspaceId(membership.organization.id);
      router.push("/app");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="stack" onSubmit={submit}>
      <div className="field">
        <label htmlFor="email">Email address</label>
        <input
          autoComplete="email"
          className="input"
          id="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          autoComplete="current-password"
          className="input"
          id="password"
          minLength={12}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </div>
      {error === "" ? null : <Alert tone="error">{error}</Alert>}
      <button className="button button-signal" disabled={pending} type="submit">
        <KeyRound size={15} />
        {pending ? "Checking session…" : "Sign in"}
        <ArrowRight size={15} />
      </button>
    </form>
  );
}

export function DemoLauncher() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function launch() {
    setPending(true);
    setError("");
    try {
      let me = await apiRequest("/api/v1/me", meResponseSchema).catch(() => null);
      if (me === null) {
        const suffix = crypto.randomUUID();
        const email = `demo+${suffix}@mindpay.test`;
        const password = `Mp!${crypto.randomUUID()}-${crypto.randomUUID()}`;
        await authPost("sign-up/email", { email, name: "Demo operator", password });
        await authPost("sign-in/email", { email, password });
        me = await apiRequest("/api/v1/me", meResponseSchema);
      }
      const existing = me.organizations[0];
      if (existing !== undefined) {
        storeWorkspaceId(existing.organization.id);
      } else {
        const created = await apiRequest(
          "/api/v1/demo-workspaces",
          provisionDemoWorkspaceResponseSchema,
          {
            body: JSON.stringify({ name: "MindPay Demo Workspace" }),
            headers: { "idempotency-key": idempotencyKey("demo") },
            method: "POST",
          },
        );
        storeWorkspaceId(created.workspace.organization.id);
      }
      router.push("/app");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The demo workspace could not be created.");
      setPending(false);
    }
  }
  return (
    <div className="stack">
      {error === "" ? null : (
        <Alert tone="error">
          {error} Confirm that the gateway is running on {API_ORIGIN}, then try again.
        </Alert>
      )}
      <button className="button button-signal" disabled={pending} onClick={launch} type="button">
        <Play size={15} />
        {pending ? "Preparing an isolated workspace…" : "Launch the 24-hour demo"}
      </button>
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.6, margin: 0 }}>
        A temporary local account and isolated workspace are created. The generated password stays
        only in this browser session and is never displayed or written to storage.
      </p>
    </div>
  );
}
