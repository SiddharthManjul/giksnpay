"use client";

import { type MeResponse, meResponseSchema } from "@mindpay/contracts";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { create } from "zustand";
import { apiRequest, storeWorkspaceId, WORKSPACE_STORAGE_KEY } from "./api";

interface WorkspaceStore {
  hydrated: boolean;
  organizationId: string | null;
  setOrganizationId: (organizationId: string | null) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  hydrated: false,
  organizationId: null,
  setOrganizationId: (organizationId) => set({ hydrated: true, organizationId }),
}));

export function useWorkspaceSession() {
  const { hydrated, organizationId, setOrganizationId } = useWorkspaceStore();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => apiRequest("/api/v1/me", meResponseSchema),
    retry: false,
  });
  useEffect(() => {
    if (me.data === undefined || hydrated) return;
    const stored = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    const selected =
      me.data.organizations.find((entry) => entry.organization.id === stored) ??
      me.data.organizations[0];
    const nextId = selected?.organization.id ?? null;
    if (nextId !== null) storeWorkspaceId(nextId);
    setOrganizationId(nextId);
  }, [hydrated, me.data, setOrganizationId]);
  const membership = membershipFor(me.data, organizationId);
  return { hydrated, me, membership, organizationId };
}

function membershipFor(me: MeResponse | undefined, organizationId: string | null) {
  return me?.organizations.find((entry) => entry.organization.id === organizationId) ?? null;
}
