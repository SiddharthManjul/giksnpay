import {
  getOrganizationCapabilities,
  organizationCapabilities,
  organizationCapabilitySchema,
  organizationRoleSchema,
  type OrganizationRole,
  utcTimestampSchema,
} from "@mindpay/domain";
import { z } from "zod";
import { organizationIdSchema, userIdSchema } from "./cross-party";

export const organizationStatusSchema = z.enum(["ACTIVE", "SUSPENDED", "EXPIRED"]);

export const organizationProfileSchema = z
  .object({
    id: organizationIdSchema,
    name: z.string().trim().min(1).max(128),
    slug: z
      .string()
      .min(3)
      .max(63)
      .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u),
    status: organizationStatusSchema,
  })
  .strict()
  .readonly();

export const organizationAccessSchema = z
  .object({
    capabilities: z
      .array(organizationCapabilitySchema)
      .max(organizationCapabilities.length)
      .refine((capabilities) => new Set(capabilities).size === capabilities.length)
      .readonly(),
    role: organizationRoleSchema,
  })
  .strict()
  .superRefine((access, context) => {
    const expected = getOrganizationCapabilities(access.role);
    if (
      access.capabilities.length !== expected.length ||
      access.capabilities.some((capability, index) => capability !== expected[index])
    ) {
      context.addIssue({
        code: "custom",
        message: "Capabilities must exactly match the assigned organization role",
        path: ["capabilities"],
      });
    }
  })
  .readonly();

export const currentOrganizationResponseSchema = z
  .object({
    access: organizationAccessSchema,
    organization: organizationProfileSchema,
  })
  .strict()
  .readonly();

export const organizationMemberSchema = z
  .object({
    joinedAt: utcTimestampSchema,
    role: organizationRoleSchema,
    user: z
      .object({
        id: userIdSchema,
        image: z.string().url().nullable(),
        name: z.string().trim().min(1).max(128),
      })
      .strict()
      .readonly(),
  })
  .strict()
  .readonly();

export const organizationMembersResponseSchema = z
  .object({
    members: z
      .array(organizationMemberSchema)
      .max(1_000)
      .refine((members) => new Set(members.map((member) => member.user.id)).size === members.length)
      .readonly(),
    organizationId: organizationIdSchema,
  })
  .strict()
  .readonly();

export const meResponseSchema = z
  .object({
    organizations: z
      .array(
        z
          .object({
            access: organizationAccessSchema,
            organization: organizationProfileSchema,
          })
          .strict()
          .readonly(),
      )
      .max(100)
      .refine(
        (organizations) =>
          new Set(organizations.map((entry) => entry.organization.id)).size ===
          organizations.length,
      )
      .readonly(),
    user: z
      .object({
        email: z.string().email().max(320),
        emailVerified: z.boolean(),
        id: userIdSchema,
        image: z.string().url().nullable(),
        name: z.string().trim().min(1).max(128),
      })
      .strict()
      .readonly(),
  })
  .strict()
  .readonly();

export const updateOrganizationRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(128),
  })
  .strict()
  .readonly();

export const updateOrganizationMemberRoleRequestSchema = z
  .object({
    role: organizationRoleSchema,
  })
  .strict()
  .readonly();

export const apiErrorCodeSchema = z.enum([
  "AUTHENTICATION_REQUIRED",
  "AUTHORIZATION_DENIED",
  "CROSS_ORIGIN_REQUEST_DENIED",
  "DEMO_WORKSPACE_PROVISIONING_FAILED",
  "IDEMPOTENCY_CONFLICT",
  "IDEMPOTENCY_KEY_REQUIRED",
  "IDEMPOTENCY_REQUEST_IN_PROGRESS",
  "INVALID_REQUEST",
  "LAST_OWNER_REQUIRED",
  "MERCHANT_ALREADY_EXISTS",
  "MERCHANT_STATE_CONFLICT",
  "MERCHANT_VERIFICATION_UNAVAILABLE",
  "ORGANIZATION_CONTEXT_REQUIRED",
  "PASSKEY_ALREADY_REGISTERED",
  "PASSKEY_CHALLENGE_INVALID",
  "PASSKEY_LIMIT_REACHED",
  "PASSKEY_REGISTRATION_FAILED",
  "RESOURCE_NOT_FOUND",
  "ROLE_ASSIGNMENT_DENIED",
]);

export const apiErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: apiErrorCodeSchema,
        message: z.string().min(1).max(256),
      })
      .strict()
      .readonly(),
  })
  .strict()
  .readonly();

export type OrganizationStatus = z.infer<typeof organizationStatusSchema>;
export type OrganizationProfile = z.infer<typeof organizationProfileSchema>;
export type OrganizationAccess = z.infer<typeof organizationAccessSchema>;
export type CurrentOrganizationResponse = z.infer<typeof currentOrganizationResponseSchema>;
export type OrganizationMember = z.infer<typeof organizationMemberSchema>;
export type OrganizationMembersResponse = z.infer<typeof organizationMembersResponseSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type UpdateOrganizationRequest = z.infer<typeof updateOrganizationRequestSchema>;
export type UpdateOrganizationMemberRoleRequest = z.infer<
  typeof updateOrganizationMemberRoleRequestSchema
>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export function createOrganizationAccess(role: OrganizationRole): OrganizationAccess {
  return organizationAccessSchema.parse({
    capabilities: getOrganizationCapabilities(role),
    role,
  });
}
