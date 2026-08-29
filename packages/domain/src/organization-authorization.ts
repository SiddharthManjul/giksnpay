import { z } from "zod";

export const organizationRoles = Object.freeze([
  "OWNER",
  "ADMIN",
  "BUILDER",
  "REVIEWER",
  "VIEWER",
] as const);

export const organizationCapabilities = Object.freeze([
  "organization:read",
  "organization:update",
  "member:read",
  "member:manage",
  "agent:read",
  "agent:write",
  "approval:review",
] as const);

export const organizationRoleSchema = z.enum(organizationRoles);
export const organizationCapabilitySchema = z.enum(organizationCapabilities);

export type OrganizationRole = z.infer<typeof organizationRoleSchema>;
export type OrganizationCapability = z.infer<typeof organizationCapabilitySchema>;

const roleCapabilities = {
  ADMIN: organizationCapabilities,
  BUILDER: Object.freeze(["organization:read", "member:read", "agent:read", "agent:write"]),
  OWNER: organizationCapabilities,
  REVIEWER: Object.freeze(["organization:read", "member:read", "agent:read", "approval:review"]),
  VIEWER: Object.freeze(["organization:read", "member:read", "agent:read"]),
} as const satisfies Readonly<Record<OrganizationRole, readonly OrganizationCapability[]>>;

const adminManagedRoles = new Set<OrganizationRole>(["BUILDER", "REVIEWER", "VIEWER"]);

export function getOrganizationCapabilities(
  role: OrganizationRole,
): readonly OrganizationCapability[] {
  return roleCapabilities[role];
}

export function hasOrganizationCapability(
  role: OrganizationRole,
  capability: OrganizationCapability,
): boolean {
  const capabilities: readonly OrganizationCapability[] = roleCapabilities[role];
  return capabilities.includes(capability);
}

export function canAssignOrganizationRole(
  actorRole: OrganizationRole,
  currentTargetRole: OrganizationRole,
  nextTargetRole: OrganizationRole,
): boolean {
  if (actorRole === "OWNER") {
    return true;
  }

  return (
    actorRole === "ADMIN" &&
    adminManagedRoles.has(currentTargetRole) &&
    adminManagedRoles.has(nextTargetRole)
  );
}
