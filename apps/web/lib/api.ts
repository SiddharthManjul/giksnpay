import { apiErrorResponseSchema } from "@mindpay/contracts";
import type { ZodType } from "zod";

export const API_ORIGIN = (
  process.env.NEXT_PUBLIC_MINDPAY_API_URL ?? "http://localhost:8787"
).replace(/\/$/u, "");
export const ORGANIZATION_HEADER = "x-mindpay-organization-id";
export const WORKSPACE_STORAGE_KEY = "mindpay.organization";

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function apiRequest<T>(
  path: string,
  schema: ZodType<T>,
  init: RequestInit = {},
  organizationId?: string | null,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (organizationId !== undefined && organizationId !== null) {
    headers.set(ORGANIZATION_HEADER, organizationId);
  }
  if (init.body !== undefined && !headers.has("content-type"))
    headers.set("content-type", "application/json");
  const response = await fetch(`${API_ORIGIN}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
  const data = await response.json().catch(() => undefined);
  if (!response.ok) {
    const parsed = apiErrorResponseSchema.safeParse(data);
    throw new ApiClientError(
      parsed.success ? parsed.data.error.code : "REQUEST_FAILED",
      parsed.success ? parsed.data.error.message : `Request failed with status ${response.status}.`,
      response.status,
    );
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ApiClientError(
      "RESPONSE_CONTRACT_INVALID",
      "The server returned an unexpected response. Refresh after the service is updated.",
      response.status,
    );
  }
  return parsed.data;
}

export function idempotencyKey(scope: string): string {
  return `${scope}-${crypto.randomUUID()}`;
}

export function storeWorkspaceId(organizationId: string): void {
  window.localStorage.setItem(WORKSPACE_STORAGE_KEY, organizationId);
}
