import { z } from "zod";

import type { CapabilityApproval, CapabilityRisk } from "./capabilities";

export const ADMIN_ISSUE_TYPES = [
  "unclaimed_account",
  "unlinked_parent",
  "duplicate_email",
  "missing_email"
] as const;
export type AdminIssueType = (typeof ADMIN_ISSUE_TYPES)[number];

export const ADMIN_ISSUE_SEVERITIES = ["critical", "warning", "info"] as const;
export type AdminIssueSeverity = (typeof ADMIN_ISSUE_SEVERITIES)[number];

export interface AdminIssueSubject {
  readonly persona: "staff" | "parent";
  readonly subjectId: number;
  readonly userId: number | null;
  readonly name: string | null;
  readonly email: string | null;
  readonly phone: string | null;
}

export interface AdminIssue {
  readonly id: string;
  readonly type: AdminIssueType;
  readonly severity: AdminIssueSeverity;
  readonly status: "open";
  readonly title: string;
  readonly summary: string;
  readonly subject: AdminIssueSubject;
  readonly evidence: readonly string[];
  readonly actions: readonly AdminIssueAction[];
}

export interface AdminIssueAction {
  readonly id: "create_claim_link" | "manual_review";
  readonly label: string;
  readonly risk: CapabilityRisk;
  readonly approval: CapabilityApproval;
  readonly params: Readonly<Record<string, string | number | boolean>>;
}

export interface AdminIssuePage {
  readonly items: readonly AdminIssue[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly counts: Readonly<Record<AdminIssueType, number>>;
}

export interface AdminIssuePlan {
  readonly issueId: string;
  readonly version: 1;
  readonly actions: readonly AdminIssueAction[];
  readonly note: string;
}

export interface AdminIssueApplyInput {
  readonly actionId: "create_claim_link" | "manual_review";
  readonly ttlHours?: number;
  readonly confirm: "apply";
}

export interface AdminIssueApplyResult {
  readonly issueId: string;
  readonly status: "applied" | "manual_review_required";
  readonly claimLink?: {
    readonly id: string;
    readonly url: string;
    readonly expiresAt: number;
  };
}

export const adminIssueQuerySchema = z
  .object({
    type: z.enum(["all", ...ADMIN_ISSUE_TYPES]).default("all"),
    severity: z.enum(["all", ...ADMIN_ISSUE_SEVERITIES]).default("all"),
    search: z.string().trim().max(200).default(""),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(25)
  })
  .strict();

export type AdminIssueQuery = z.infer<typeof adminIssueQuerySchema>;

export const adminIssueIdParamsSchema = z.object({
  id: z.string().trim().min(3).max(80).regex(/^[a-z_]+:(staff|parent):\d+$/)
});

export type AdminIssueIdParams = z.infer<typeof adminIssueIdParamsSchema>;

export const adminIssueApplySchema = z
  .object({
    actionId: z.enum(["create_claim_link", "manual_review"]),
    ttlHours: z.number().int().min(1).max(168).optional(),
    confirm: z.literal("apply")
  })
  .strict();

export type AdminIssueApplyBody = z.infer<typeof adminIssueApplySchema>;
