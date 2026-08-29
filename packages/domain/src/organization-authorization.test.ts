import { describe, expect, it } from "vitest";
import {
  canAssignOrganizationRole,
  getOrganizationCapabilities,
  hasOrganizationCapability,
  organizationCapabilities,
  organizationRoles,
} from "./organization-authorization";

describe("organization authorization", () => {
  it("freezes the complete role and capability vocabulary", () => {
    expect(organizationRoles).toEqual(["OWNER", "ADMIN", "BUILDER", "REVIEWER", "VIEWER"]);
    expect(organizationCapabilities).toEqual([
      "organization:read",
      "organization:update",
      "member:read",
      "member:manage",
      "agent:read",
      "agent:write",
      "approval:review",
    ]);
  });

  it.each([
    ["OWNER", "organization:update", true],
    ["ADMIN", "member:manage", true],
    ["BUILDER", "agent:write", true],
    ["BUILDER", "approval:review", false],
    ["REVIEWER", "approval:review", true],
    ["REVIEWER", "agent:write", false],
    ["VIEWER", "agent:read", true],
    ["VIEWER", "organization:update", false],
  ] as const)("evaluates %s access to %s", (role, capability, expected) => {
    expect(hasOrganizationCapability(role, capability)).toBe(expected);
  });

  it("returns immutable capabilities for each role", () => {
    for (const role of organizationRoles) {
      expect(Object.isFrozen(getOrganizationCapabilities(role))).toBe(true);
    }
  });

  it("limits administrators to non-privileged role assignments", () => {
    expect(canAssignOrganizationRole("OWNER", "OWNER", "VIEWER")).toBe(true);
    expect(canAssignOrganizationRole("ADMIN", "VIEWER", "BUILDER")).toBe(true);
    expect(canAssignOrganizationRole("ADMIN", "ADMIN", "VIEWER")).toBe(false);
    expect(canAssignOrganizationRole("ADMIN", "VIEWER", "OWNER")).toBe(false);
    expect(canAssignOrganizationRole("BUILDER", "VIEWER", "REVIEWER")).toBe(false);
  });
});
