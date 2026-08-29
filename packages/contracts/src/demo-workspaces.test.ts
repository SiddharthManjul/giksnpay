import { describe, expect, it } from "vitest";
import {
  demoWorkspaceSchema,
  provisionDemoWorkspaceRequestSchema,
  provisionDemoWorkspaceResponseSchema,
} from "./demo-workspaces";
import { createOrganizationAccess } from "./identity";

const workspace = {
  access: createOrganizationAccess("OWNER"),
  createdAt: "2026-08-29T12:00:00.000Z",
  expiresAt: "2026-08-30T12:00:00.000Z",
  organization: {
    id: "org_01JGFJH900H8M2APVYVDZ4R6AA",
    name: "MindPay Demo Workspace",
    slug: "demo-01jgfjh900h8m2apvyvdz4r6aa",
    status: "ACTIVE",
  },
} as const;

describe("demo workspace API contracts", () => {
  it("accepts an empty request and a bounded custom name", () => {
    expect(provisionDemoWorkspaceRequestSchema.parse({})).toEqual({});
    expect(provisionDemoWorkspaceRequestSchema.parse({ name: "  Judge Demo  " })).toEqual({
      name: "Judge Demo",
    });
  });

  it("freezes the owner access and expiry response", () => {
    expect(provisionDemoWorkspaceResponseSchema.parse({ workspace })).toEqual({ workspace });
    expect(() =>
      demoWorkspaceSchema.parse({
        ...workspace,
        access: createOrganizationAccess("ADMIN"),
      }),
    ).toThrow(/owner access/);
    expect(() =>
      demoWorkspaceSchema.parse({ ...workspace, expiresAt: workspace.createdAt }),
    ).toThrow(/expiry/);
  });

  it("rejects unknown request fields and malformed names", () => {
    expect(() => provisionDemoWorkspaceRequestSchema.parse({ template: "unsafe" })).toThrow();
    expect(() => provisionDemoWorkspaceRequestSchema.parse({ name: "   " })).toThrow();
  });
});
