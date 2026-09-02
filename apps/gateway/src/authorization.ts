import {
  type ApiErrorCode,
  apiErrorResponseSchema,
  organizationIdSchema,
} from "@mindpay/contracts";
import {
  createMindPayDatabase,
  demoWorkspaces,
  type Organization,
  organizationMembers,
  organizations,
} from "@mindpay/db";
import {
  hasOrganizationCapability,
  type OrganizationCapability,
  type OrganizationRole,
} from "@mindpay/domain";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import type { GatewayAuthBindings } from "./auth";
import { createGatewayAuth } from "./auth";

export const ORGANIZATION_CONTEXT_HEADER = "x-mindpay-organization-id";

export interface AuthenticatedPrincipal {
  readonly email: string;
  readonly emailVerified: boolean;
  readonly id: string;
  readonly image: string | null;
  readonly name: string;
  readonly sessionId: string;
}

export interface AuthorizedOrganization {
  readonly organization: Organization;
  readonly role: OrganizationRole;
}

export interface GatewayVariables {
  readonly organizationAuthorization: AuthorizedOrganization;
  readonly principal: AuthenticatedPrincipal;
}

export interface GatewayEnvironment {
  Bindings: GatewayAuthBindings;
  Variables: GatewayVariables;
}

export const requireAuthentication = createMiddleware<GatewayEnvironment>(async (context, next) => {
  const authSession = await createGatewayAuth(context.env).api.getSession({
    headers: context.req.raw.headers,
  });

  if (authSession === null) {
    return apiError(
      context,
      401,
      "AUTHENTICATION_REQUIRED",
      "A valid authenticated session is required.",
    );
  }

  context.set("principal", {
    email: authSession.user.email,
    emailVerified: authSession.user.emailVerified,
    id: authSession.user.id,
    image: authSession.user.image ?? null,
    name: authSession.user.name,
    sessionId: authSession.session.id,
  });
  await next();
});

export function requireOrganizationCapability(capability: OrganizationCapability) {
  return createMiddleware<GatewayEnvironment>(async (context, next) => {
    const organizationIdHeader = context.req.header(ORGANIZATION_CONTEXT_HEADER);
    if (organizationIdHeader === undefined) {
      return apiError(
        context,
        400,
        "ORGANIZATION_CONTEXT_REQUIRED",
        `The ${ORGANIZATION_CONTEXT_HEADER} header is required.`,
      );
    }

    const organizationId = organizationIdSchema.safeParse(organizationIdHeader);
    if (!organizationId.success) {
      return resourceNotFound(context);
    }

    const database = createMindPayDatabase(context.env.DB);
    const principal = context.get("principal");
    const [authorization] = await database
      .select({
        demoExpiresAt: demoWorkspaces.expiresAt,
        organization: organizations,
        role: organizationMembers.role,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .leftJoin(demoWorkspaces, eq(demoWorkspaces.organizationId, organizations.id))
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId.data),
          eq(organizationMembers.userId, principal.id),
          eq(organizations.status, "ACTIVE"),
          or(isNull(demoWorkspaces.organizationId), gt(demoWorkspaces.expiresAt, new Date())),
        ),
      )
      .limit(1);

    if (authorization === undefined) {
      return resourceNotFound(context);
    }

    if (!hasOrganizationCapability(authorization.role, capability)) {
      return apiError(
        context,
        403,
        "AUTHORIZATION_DENIED",
        "The assigned organization role does not allow this action.",
      );
    }

    context.set("organizationAuthorization", {
      organization: authorization.organization,
      role: authorization.role,
    });
    await next();
  });
}

export function resourceNotFound(context: ApiErrorContext) {
  return apiError(context, 404, "RESOURCE_NOT_FOUND", "The requested resource was not found.");
}

export function apiError(
  context: ApiErrorContext,
  status: 400 | 401 | 403 | 404 | 409 | 429 | 500,
  code: ApiErrorCode,
  message: string,
) {
  return context.json(apiErrorResponseSchema.parse({ error: { code, message } }), status);
}

interface ApiErrorContext {
  json: (
    body: ReturnType<typeof apiErrorResponseSchema.parse>,
    status: 400 | 401 | 403 | 404 | 409 | 429 | 500,
  ) => Response;
}
