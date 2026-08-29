import {
  createOrganizationAccess,
  currentOrganizationResponseSchema,
  meResponseSchema,
  organizationMemberSchema,
  organizationMembersResponseSchema,
  updateOrganizationMemberRoleRequestSchema,
  updateOrganizationRequestSchema,
  userIdSchema,
} from "@mindpay/contracts";
import {
  createMindPayDatabase,
  demoWorkspaces,
  organizationMembers,
  organizations,
  user,
} from "@mindpay/db";
import { canAssignOrganizationRole, utcTimestampFromDate } from "@mindpay/domain";
import { and, asc, count, eq, gt, isNull, or } from "drizzle-orm";
import { Hono } from "hono";
import {
  apiError,
  type GatewayEnvironment,
  requireAuthentication,
  requireOrganizationCapability,
  resourceNotFound,
} from "./authorization";

const LAST_OWNER_TRIGGER_MESSAGE = "organization requires at least one owner";

export const organizationRoutes = new Hono<GatewayEnvironment>();

organizationRoutes.use("*", requireAuthentication);

organizationRoutes.get("/me", async (context) => {
  const principal = context.get("principal");
  const database = createMindPayDatabase(context.env.DB);
  const memberships = await database
    .select({ organization: organizations, role: organizationMembers.role })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .leftJoin(demoWorkspaces, eq(demoWorkspaces.organizationId, organizations.id))
    .where(
      and(
        eq(organizationMembers.userId, principal.id),
        eq(organizations.status, "ACTIVE"),
        or(isNull(demoWorkspaces.organizationId), gt(demoWorkspaces.expiresAt, new Date())),
      ),
    )
    .orderBy(asc(organizations.name), asc(organizations.id));

  return context.json(
    meResponseSchema.parse({
      organizations: memberships.map((membership) => ({
        access: createOrganizationAccess(membership.role),
        organization: organizationProfile(membership.organization),
      })),
      user: {
        email: principal.email,
        emailVerified: principal.emailVerified,
        id: principal.id,
        image: principal.image,
        name: principal.name,
      },
    }),
  );
});

organizationRoutes.get(
  "/organizations/current",
  requireOrganizationCapability("organization:read"),
  (context) => {
    const authorization = context.get("organizationAuthorization");
    return context.json(
      currentOrganizationResponseSchema.parse({
        access: createOrganizationAccess(authorization.role),
        organization: organizationProfile(authorization.organization),
      }),
    );
  },
);

organizationRoutes.patch(
  "/organizations/current",
  requireOrganizationCapability("organization:update"),
  async (context) => {
    const request = updateOrganizationRequestSchema.safeParse(await readJsonBody(context.req.raw));
    if (!request.success) {
      return apiError(context, 400, "INVALID_REQUEST", "The organization update is invalid.");
    }

    const authorization = context.get("organizationAuthorization");
    const updatedAt = new Date();
    const database = createMindPayDatabase(context.env.DB);
    await database
      .update(organizations)
      .set({ name: request.data.name, updatedAt })
      .where(eq(organizations.id, authorization.organization.id));

    return context.json(
      currentOrganizationResponseSchema.parse({
        access: createOrganizationAccess(authorization.role),
        organization: organizationProfile({
          ...authorization.organization,
          name: request.data.name,
        }),
      }),
    );
  },
);

organizationRoutes.get(
  "/organizations/current/members",
  requireOrganizationCapability("member:read"),
  async (context) => {
    const authorization = context.get("organizationAuthorization");
    const database = createMindPayDatabase(context.env.DB);
    const members = await database
      .select({
        joinedAt: organizationMembers.createdAt,
        role: organizationMembers.role,
        userId: user.id,
        userImage: user.image,
        userName: user.name,
      })
      .from(organizationMembers)
      .innerJoin(user, eq(user.id, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, authorization.organization.id))
      .orderBy(asc(organizationMembers.createdAt), asc(user.id));

    return context.json(
      organizationMembersResponseSchema.parse({
        members: members.map((member) => ({
          joinedAt: utcTimestampFromDate(member.joinedAt),
          role: member.role,
          user: {
            id: member.userId,
            image: member.userImage ?? null,
            name: member.userName,
          },
        })),
        organizationId: authorization.organization.id,
      }),
    );
  },
);

organizationRoutes.patch(
  "/organizations/current/members/:userId",
  requireOrganizationCapability("member:manage"),
  async (context) => {
    const targetUserId = userIdSchema.safeParse(context.req.param("userId"));
    if (!targetUserId.success) {
      return resourceNotFound(context);
    }

    const request = updateOrganizationMemberRoleRequestSchema.safeParse(
      await readJsonBody(context.req.raw),
    );
    if (!request.success) {
      return apiError(context, 400, "INVALID_REQUEST", "The membership update is invalid.");
    }

    const authorization = context.get("organizationAuthorization");
    const database = createMindPayDatabase(context.env.DB);
    const [targetMembership] = await database
      .select({
        joinedAt: organizationMembers.createdAt,
        role: organizationMembers.role,
        userId: user.id,
        userImage: user.image,
        userName: user.name,
      })
      .from(organizationMembers)
      .innerJoin(user, eq(user.id, organizationMembers.userId))
      .where(
        and(
          eq(organizationMembers.organizationId, authorization.organization.id),
          eq(organizationMembers.userId, targetUserId.data),
        ),
      )
      .limit(1);

    if (targetMembership === undefined) {
      return resourceNotFound(context);
    }

    if (!canAssignOrganizationRole(authorization.role, targetMembership.role, request.data.role)) {
      return apiError(
        context,
        403,
        "ROLE_ASSIGNMENT_DENIED",
        "The assigned organization role cannot make this role assignment.",
      );
    }

    if (targetMembership.role === request.data.role) {
      return context.json(serializeMember(targetMembership));
    }

    if (targetMembership.role === "OWNER" && request.data.role !== "OWNER") {
      const [ownerCount] = await database
        .select({ value: count() })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, authorization.organization.id),
            eq(organizationMembers.role, "OWNER"),
          ),
        );
      if (ownerCount === undefined || ownerCount.value <= 1) {
        return lastOwnerRequired(context);
      }
    }

    try {
      const updatedMemberships = await database
        .update(organizationMembers)
        .set({ role: request.data.role })
        .where(
          and(
            eq(organizationMembers.organizationId, authorization.organization.id),
            eq(organizationMembers.userId, targetUserId.data),
            eq(organizationMembers.role, targetMembership.role),
          ),
        )
        .returning({ role: organizationMembers.role });

      if (updatedMemberships.length !== 1) {
        return resourceNotFound(context);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes(LAST_OWNER_TRIGGER_MESSAGE)) {
        return lastOwnerRequired(context);
      }
      throw error;
    }

    return context.json(
      serializeMember({
        ...targetMembership,
        role: request.data.role,
      }),
    );
  },
);

function organizationProfile(organization: {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: "ACTIVE" | "SUSPENDED" | "EXPIRED";
}) {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    status: organization.status,
  };
}

function serializeMember(member: {
  readonly joinedAt: Date;
  readonly role: "OWNER" | "ADMIN" | "BUILDER" | "REVIEWER" | "VIEWER";
  readonly userId: string;
  readonly userImage: string | null;
  readonly userName: string;
}) {
  return organizationMemberSchema.parse({
    joinedAt: utcTimestampFromDate(member.joinedAt),
    role: member.role,
    user: {
      id: member.userId,
      image: member.userImage ?? null,
      name: member.userName,
    },
  });
}

function lastOwnerRequired(context: Parameters<typeof apiError>[0]) {
  return apiError(
    context,
    409,
    "LAST_OWNER_REQUIRED",
    "An organization must retain at least one owner.",
  );
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
