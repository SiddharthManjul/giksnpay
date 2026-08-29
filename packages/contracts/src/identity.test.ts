import { describe, expect, it } from "vitest";
import {
  apiErrorResponseSchema,
  createOrganizationAccess,
  currentOrganizationResponseSchema,
  meResponseSchema,
  organizationAccessSchema,
  updateOrganizationMemberRoleRequestSchema,
  updateOrganizationRequestSchema,
} from "./identity";

const organization = {
  id: "org_01JGFJH900H8M2APVYVDZ4R6AA",
  name: "SignalWorks Demo",
  slug: "signalworks-demo",
  status: "ACTIVE",
} as const;

describe("identity and organization API contracts", () => {
  it("creates exact capabilities from the assigned role", () => {
    expect(createOrganizationAccess("BUILDER")).toEqual({
      capabilities: ["organization:read", "member:read", "agent:read", "agent:write"],
      role: "BUILDER",
    });
  });

  it("rejects forged or reordered role capabilities", () => {
    expect(() =>
      organizationAccessSchema.parse({ capabilities: ["organization:read"], role: "OWNER" }),
    ).toThrow(/exactly match/);
    expect(() =>
      organizationAccessSchema.parse({
        capabilities: ["agent:read", "organization:read", "member:read"],
        role: "VIEWER",
      }),
    ).toThrow(/exactly match/);
  });

  it("validates the current organization response", () => {
    expect(
      currentOrganizationResponseSchema.parse({
        access: createOrganizationAccess("REVIEWER"),
        organization,
      }),
    ).toEqual({
      access: {
        capabilities: ["organization:read", "member:read", "agent:read", "approval:review"],
        role: "REVIEWER",
      },
      organization,
    });
  });

  it("rejects malformed profile and mutation boundaries", () => {
    expect(() => updateOrganizationRequestSchema.parse({ name: "   " })).toThrow();
    expect(() =>
      updateOrganizationRequestSchema.parse({ name: "Valid", slug: "injected" }),
    ).toThrow();
    expect(() =>
      updateOrganizationMemberRoleRequestSchema.parse({ role: "SUPER_ADMIN" }),
    ).toThrow();
    expect(() =>
      meResponseSchema.parse({
        organizations: [],
        user: {
          email: "not-an-email",
          emailVerified: false,
          id: "usr_invalid",
          image: null,
          name: "Demo",
        },
      }),
    ).toThrow();
  });

  it("freezes the browser security error response", () => {
    expect(
      apiErrorResponseSchema.parse({
        error: {
          code: "CROSS_ORIGIN_REQUEST_DENIED",
          message: "The browser request origin is not allowed.",
        },
      }),
    ).toEqual({
      error: {
        code: "CROSS_ORIGIN_REQUEST_DENIED",
        message: "The browser request origin is not allowed.",
      },
    });
    expect(() =>
      apiErrorResponseSchema.parse({ error: { code: "UNKNOWN", message: "Unknown" } }),
    ).toThrow();
  });
});
