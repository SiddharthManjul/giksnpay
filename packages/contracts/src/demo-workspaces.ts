import { utcTimestampSchema } from "@mindpay/domain";
import { z } from "zod";
import { organizationAccessSchema, organizationProfileSchema } from "./identity";

export const provisionDemoWorkspaceRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(128).optional(),
  })
  .strict()
  .readonly();

export const demoWorkspaceSchema = z
  .object({
    access: organizationAccessSchema,
    createdAt: utcTimestampSchema,
    expiresAt: utcTimestampSchema,
    organization: organizationProfileSchema,
  })
  .strict()
  .superRefine((workspace, context) => {
    if (Date.parse(workspace.expiresAt) <= Date.parse(workspace.createdAt)) {
      context.addIssue({
        code: "custom",
        message: "Demo workspace expiry must be later than creation",
        path: ["expiresAt"],
      });
    }
    if (workspace.access.role !== "OWNER") {
      context.addIssue({
        code: "custom",
        message: "A provisioned demo workspace must grant owner access",
        path: ["access", "role"],
      });
    }
  })
  .readonly();

export const provisionDemoWorkspaceResponseSchema = z
  .object({
    workspace: demoWorkspaceSchema,
  })
  .strict()
  .readonly();

export type DemoWorkspace = z.infer<typeof demoWorkspaceSchema>;
export type ProvisionDemoWorkspaceRequest = z.infer<typeof provisionDemoWorkspaceRequestSchema>;
export type ProvisionDemoWorkspaceResponse = z.infer<typeof provisionDemoWorkspaceResponseSchema>;
