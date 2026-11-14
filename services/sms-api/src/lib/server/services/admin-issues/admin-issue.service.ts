import {
  type AdminIssue,
  type AdminIssueAction,
  type AdminIssueApplyInput,
  type AdminIssueApplyResult,
  type AdminIssuePage,
  type AdminIssuePlan,
  type AdminIssueSeverity,
  type AdminIssueSubject,
  type AdminIssueType
} from "@edapex/contracts";

import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { NotFoundError, ValidationError } from "../errors";
import { createClaimLink } from "../auth/claim-link-create";

interface IssueQuery {
  readonly type: AdminIssueType | "all";
  readonly severity: AdminIssueSeverity | "all";
  readonly search: string;
  readonly page: number;
  readonly pageSize: number;
}

const normalized = (value: string | null): string => value?.trim().toLowerCase() ?? "";

const issueId = (type: AdminIssueType, subject: AdminIssueSubject): string =>
  `${type}:${subject.persona}:${subject.subjectId}`;

const severityFor = (type: AdminIssueType): AdminIssueSeverity => {
  if (type === "unlinked_parent" || type === "duplicate_email") return "critical";
  if (type === "unclaimed_account") return "warning";
  return "info";
};

const titleFor = (type: AdminIssueType, name: string | null): string => {
  const person = name?.trim().length ? name : "Unnamed record";
  switch (type) {
    case "unclaimed_account":
      return `${person} has not claimed their account`;
    case "unlinked_parent":
      return `${person} is not linked to a user account`;
    case "duplicate_email":
      return `${person} shares an email address`;
    case "missing_email":
      return `${person} has no email address`;
  }
};

const summaryFor = (type: AdminIssueType): string => {
  switch (type) {
    case "unclaimed_account":
      return "Issue a one-time claim link so the person can verify their identity with Google.";
    case "unlinked_parent":
      return "Provisioning a claim link will create a pending user and link this guardian record.";
    case "duplicate_email":
      return "Resolve the duplicate account before issuing credentials or changing the email.";
    case "missing_email":
      return "Add a unique email address before a claim link can be issued.";
  }
};

const actionsFor = (
  type: AdminIssueType,
  subject: AdminIssueSubject
): readonly AdminIssueAction[] => {
  const manual: AdminIssueAction = {
    id: "manual_review",
    label: "Review manually",
    risk: "read",
    approval: "none",
    params: {}
  };
  if (subject.email === null || subject.email.length === 0) return [manual];
  if (type !== "unclaimed_account" && type !== "unlinked_parent") return [manual];
  return [
    {
      id: "create_claim_link",
      label: "Create a 72-hour claim link",
      risk: "write",
      approval: "required",
      params: { ttlHours: 72 }
    },
    manual
  ];
};

const issueFor = (
  type: AdminIssueType,
  subject: AdminIssueSubject,
  evidence: readonly string[]
): AdminIssue => ({
  id: issueId(type, subject),
  type,
  severity: severityFor(type),
  status: "open",
  title: titleFor(type, subject.name),
  summary: summaryFor(type),
  subject,
  evidence,
  actions: actionsFor(type, subject)
});

/**
 * The unified admin issue queue is intentionally derived from the existing
 * identity and duplicate-email read models. It does not create a second source
 * of truth; apply delegates to the claim-link service.
 */
export class AdminIssueService {
  constructor(private readonly ctx: ServiceContext) {}

  async list(query: IssueQuery): Promise<AdminIssuePage> {
    const issues = await this.collect();
    const search = normalized(query.search);
    const filtered = issues.filter((issue) => {
      if (query.type !== "all" && issue.type !== query.type) return false;
      if (query.severity !== "all" && issue.severity !== query.severity) return false;
      if (search.length === 0) return true;
      return [issue.subject.name, issue.subject.email, issue.subject.phone]
        .map(normalized)
        .some((value) => value.includes(search));
    });
    const page = Math.max(query.page, 1);
    const pageSize = Math.min(Math.max(query.pageSize, 1), 100);
    const start = (page - 1) * pageSize;
    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize,
      counts: this.counts(issues)
    };
  }

  async get(id: string): Promise<AdminIssue> {
    const issue = (await this.collect()).find((candidate) => candidate.id === id);
    if (issue === undefined) throw new NotFoundError("admin issue", id);
    return issue;
  }

  async plan(id: string): Promise<AdminIssuePlan> {
    const issue = await this.get(id);
    return {
      issueId: issue.id,
      version: 1,
      actions: issue.actions,
      note:
        issue.actions.some((action) => action.id === "create_claim_link")
          ? "A claim link is one-time and expires after 72 hours unless a different ttlHours is supplied."
          : "This issue needs a manual data review before any write."
    };
  }

  async apply(
    id: string,
    input: AdminIssueApplyInput,
    adminUserId: number
  ): Promise<AdminIssueApplyResult> {
    const issue = await this.get(id);
    const action = issue.actions.find((candidate) => candidate.id === input.actionId);
    if (action === undefined) {
      throw new ValidationError("The selected action is not available for this issue", "actionId");
    }
    if (action.id === "manual_review") {
      return { issueId: id, status: "manual_review_required" };
    }
    const link = await createClaimLink(this.ctx, {
      subjectType: issue.subject.persona,
      subjectId: issue.subject.subjectId,
      ttlHours: input.ttlHours ?? 72,
      adminUserId
    });
    return { issueId: id, status: "applied", claimLink: link };
  }

  private async collect(): Promise<readonly AdminIssue[]> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const [people, duplicates] = await Promise.all([
      this.ctx.repos.queries.listClaimDirectory(scoped),
      this.ctx.repos.queries.listDuplicateEmailGroups(scoped)
    ]);
    const duplicateEmails = new Set(
      duplicates.map((row) => normalized(row.email)).filter((email) => email.length > 0)
    );
    const issues: AdminIssue[] = [];
    for (const row of people) {
      const subject: AdminIssueSubject = {
        persona: row.persona,
        subjectId: row.recordId,
        userId: row.userId,
        name: row.fullName,
        email: row.email,
        phone: row.phone
      };
      if (
        row.userId !== null &&
        row.claimStatus !== "claimed" &&
        row.claimStatus !== "flagged"
      ) {
        issues.push(
          issueFor("unclaimed_account", subject, [
            `claimStatus=${row.claimStatus ?? "none"}`,
            `userId=${row.userId}`
          ])
        );
      }
      if (row.persona === "parent" && row.userId === null) {
        issues.push(issueFor("unlinked_parent", subject, ["No users row is linked"]));
      }
      if (row.email !== null && duplicateEmails.has(normalized(row.email))) {
        issues.push(issueFor("duplicate_email", subject, [`email=${row.email}`]));
      }
      if (row.email === null || row.email.trim().length === 0) {
        issues.push(issueFor("missing_email", subject, ["email is empty"]));
      }
    }
    return issues;
  }

  private counts(issues: readonly AdminIssue[]): Readonly<Record<AdminIssueType, number>> {
    const counts: Record<AdminIssueType, number> = {
      unclaimed_account: 0,
      unlinked_parent: 0,
      duplicate_email: 0,
      missing_email: 0
    };
    for (const issue of issues) counts[issue.type] += 1;
    return counts;
  }
}
