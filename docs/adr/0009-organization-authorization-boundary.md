# ADR-0009: Organization authorization boundary

- Status: Accepted
- Date: 2026-08-29
- Owners: MindPay engineering

## Context

Every later MindPay object belongs to an organization. Authentication proves which user made a
request, but it does not prove that the user belongs to the selected organization or may perform a
specific action there. Tenant selection, membership lookup, role capability checks, and target
object scoping must therefore happen before a route reads or mutates organization-owned data.

Returning different errors for an organization that does not exist and one that exists outside the
caller's tenancy would let authenticated users enumerate other workspaces and their members.

## Decision

Treat `@mindpay/domain` as the role and capability authority. The fixed role matrix is:

| Role | Organization | Members | Agents | Approvals |
|---|---|---|---|---|
| OWNER | Read, update | Read, manage all roles | Read, write | Review |
| ADMIN | Read, update | Read, manage non-privileged roles | Read, write | Review |
| BUILDER | Read | Read | Read, write | No access |
| REVIEWER | Read | Read | Read | Review |
| VIEWER | Read | Read | Read | No access |

Admins may assign only BUILDER, REVIEWER, and VIEWER roles and cannot modify an OWNER or ADMIN.
Owners may assign every role, but an organization must always retain at least one owner. D1
`BEFORE UPDATE` and `BEFORE DELETE` triggers enforce that invariant under concurrency instead of
depending only on an application read-before-write check.

Authenticate every `/api/v1/*` organization route with the Better Auth database session. Select
the organization explicitly with `x-mindpay-organization-id`; never infer tenancy from an object ID
or accept an unscoped organization query. Resolve access with a join constrained by both
`organization_id` and the authenticated `user_id`, and permit access only to ACTIVE organizations.
When demo metadata exists, the same query must also prove that its expiry is still in the future.

Use these response rules:

- no valid session returns `401 AUTHENTICATION_REQUIRED`;
- a missing organization context header returns `400 ORGANIZATION_CONTEXT_REQUIRED`;
- a malformed, missing, inactive, or inaccessible organization returns the same
  `404 RESOURCE_NOT_FOUND` response;
- a member whose known role lacks a route capability returns `403 AUTHORIZATION_DENIED`;
- a target user outside the selected organization returns the same `404 RESOURCE_NOT_FOUND` as an
  unknown user;
- prohibited role escalation returns `403 ROLE_ASSIGNMENT_DENIED`; and
- removing the final owner returns `409 LAST_OWNER_REQUIRED`.

Expose `GET /api/v1/me`, `GET/PATCH /api/v1/organizations/current`,
`GET /api/v1/organizations/current/members`, and
`PATCH /api/v1/organizations/current/members/:userId`. Slugs and lifecycle status are immutable at
this API boundary. ADR-0012 defines the separate idempotent demo-workspace provisioning flow;
general membership invitation is outside this route set.

## Consequences

- Future organization-owned routes can reuse one capability vocabulary and authorization
  middleware instead of implementing role comparisons independently.
- Client code must send an explicit organization context header after selecting one of the active
  memberships returned by `/api/v1/me`.
- Cross-organization callers cannot distinguish an existing workspace or member from a missing
  one through status, error code, or message.
- The application pre-check gives a clear final-owner error, while the D1 trigger remains the
  authoritative race-safe invariant.
- Role membership does not override organization lifecycle. Suspended and expired organizations
  are unavailable through ordinary product routes.

## Alternatives considered

- Storing a mutable current organization in the session was rejected because tabs and concurrent
  requests can act in different workspaces and would race on shared session state.
- Accepting organization IDs only in route parameters was rejected because many nested object
  routes do not naturally include an organization path segment; an explicit header provides one
  consistent scoping boundary.
- Returning `403` for cross-organization access was rejected because it confirms that the target
  exists.
- Enforcing the final owner only in TypeScript was rejected because concurrent updates could both
  pass the owner-count pre-check.

## Verification

- `pnpm verify:phase-02`
- `pnpm --filter @mindpay/domain test`
- `pnpm --filter @mindpay/contracts test`
- `pnpm --filter @mindpay/db test`
- `pnpm --filter @mindpay/gateway test`
- `pnpm check`
- `pnpm build`
