"use client";

import {
  passkeyCredentialsResponseSchema,
  passkeyMutationResponseSchema,
  passkeyRegistrationOptionsResponseSchema,
  verifyPasskeyRegistrationRequestSchema,
} from "@mindpay/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fingerprint, Plus } from "lucide-react";
import { useState } from "react";
import { apiRequest } from "@/lib/api";
import { formatDate, shortId } from "@/lib/format";
import { useWorkspaceSession } from "@/lib/workspace";
import { createPasskeyCredential } from "@/lib/webauthn";
import { Alert, EmptyState, Loading, Panel, StatusBadge } from "./ui";

export function SettingsView() {
  const { me } = useWorkspaceSession();
  const client = useQueryClient();
  const [error, setError] = useState("");
  const passkeys = useQuery({
    queryKey: ["passkeys"],
    queryFn: () => apiRequest("/api/v1/passkeys", passkeyCredentialsResponseSchema),
  });
  const register = useMutation({
    mutationFn: async () => {
      if (!window.isSecureContext) throw new Error("Passkeys require HTTPS or localhost.");
      const options = await apiRequest(
        "/api/v1/passkeys/registration/options",
        passkeyRegistrationOptionsResponseSchema,
        { body: "{}", method: "POST" },
      );
      const response = await createPasskeyCredential(options);
      const request = verifyPasskeyRegistrationRequestSchema.parse({
        challengeId: options.challengeId,
        name: "MindPay approval key",
        response,
      });
      return apiRequest("/api/v1/passkeys/registration/verify", passkeyMutationResponseSchema, {
        body: JSON.stringify(request),
        method: "POST",
      });
    },
    onSuccess: async () => {
      setError("");
      await client.invalidateQueries({ queryKey: ["passkeys"] });
    },
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : "Passkey registration failed."),
  });
  return (
    <>
      <div className="page-title">
        <div>
          <h1>Settings</h1>
          <p>Account security and the local approval devices bound to {me.data?.user.email}.</p>
        </div>
        <div className="page-actions">
          <button
            className="button button-signal"
            disabled={register.isPending}
            onClick={() => register.mutate()}
            type="button"
          >
            <Plus size={15} />
            {register.isPending ? "Waiting for authenticator…" : "Register passkey"}
          </button>
        </div>
      </div>
      {error === "" ? null : (
        <div style={{ marginBottom: 18 }}>
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <Panel title="Approval passkeys">
        {passkeys.isLoading ? (
          <Loading label="Reading passkeys" />
        ) : passkeys.isError || passkeys.data === undefined ? (
          <Alert tone="error">Passkeys could not be loaded.</Alert>
        ) : passkeys.data.passkeys.length === 0 ? (
          <EmptyState
            body="Register a platform passkey before activating a spending mandate. Biometric data never leaves your device."
            title="No passkeys registered"
          />
        ) : (
          <div className="ledger-list">
            {passkeys.data.passkeys.map((passkey) => (
              <article className="ledger-item" key={passkey.id}>
                <div style={{ alignItems: "center", display: "flex", gap: 12 }}>
                  <span className="empty-icon" style={{ margin: 0 }}>
                    <Fingerprint />
                  </span>
                  <div>
                    <strong>{passkey.name ?? "Unnamed passkey"}</strong>
                    <p className="mono-id">{shortId(passkey.id)}</p>
                  </div>
                </div>
                <div>
                  <StatusBadge status={passkey.backedUp ? "BACKED_UP" : "DEVICE_BOUND"} />
                  <p>
                    {passkey.deviceType} · {passkey.transports.join(", ") || "platform transport"} ·
                    added {formatDate(passkey.createdAt)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
