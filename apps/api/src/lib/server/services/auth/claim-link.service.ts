import type { ServiceContext } from "../context";
import { requireScopedContext, requireUnscopedContext } from "../context";
import { randomToken, sha256Hex } from "../crypto/digest";
import {
  AuthError,
  ConflictError,
  NotFoundError,
  ValidationError
} from "../errors";
import { CLAIM_TICKET_TTL_SECONDS } from "./claim-policy";
import type { ClaimTicketPayload } from "./claim-policy";
import { signPayload } from "../crypto/signed-payload";
import { emitAuthEvent } from "./auth-events";

export type ClaimLinkStatus = "none" | "active" | "expired" | "used" | "revoked";
export type ClaimLinkPersona = "staff" | "parent";

export interface ClaimDirectoryItem {
  readonly persona: ClaimLinkPersona;
  readonly subjectType: ClaimLinkPersona;
  readonly subjectId: number;
  readonly recordId: number;
  readonly userId: number | null;
  readonly fullName: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly claimStatus: "pending" | "claimed" | "flagged" | null;
  readonly userActive: number | null;
  readonly emailVerifiedAt: number | null;
  readonly linkedGoogle: boolean;
  readonly isGmail: boolean;
  readonly duplicateEmail: boolean;
  readonly linkStatus: ClaimLinkStatus;
  readonly linkId: string | null;
  readonly linkExpiresAt: number | null;
}

export interface ClaimDirectoryQuery {
  readonly persona: ClaimLinkPersona | "all";
  readonly status:
    | "all"
    | "unclaimed"
    | "claimed"
    | "flagged"
    | "no_user"
    | "no_email"
    | "non_gmail"
    | "duplicate"
    | "link_active"
    | "link_revoked";
  readonly search: string;
  readonly page: number;
  readonly pageSize: number;
}

export interface ClaimDirectoryPage {
  readonly items: readonly ClaimDirectoryItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

const normalized = (value: string | null): string => value?.trim().toLowerCase() ?? "";

const linkStatusOf = (
  row: { readonly purpose: string; readonly consumedAt: number | null; readonly expiresAt: number },
  now: number
): ClaimLinkStatus => {
  if (row.purpose === "claim_link_revoked") return "revoked";
  if (row.consumedAt !== null) return "used";
  return row.expiresAt <= now ? "expired" : "active";
};

const statusMatches = (item: ClaimDirectoryItem, status: ClaimDirectoryQuery["status"]): boolean => {
  switch (status) {
    case "all":
      return true;
    case "unclaimed":
      return item.userId !== null && item.claimStatus !== "claimed" && item.claimStatus !== "flagged";
    case "claimed":
      return item.claimStatus === "claimed";
    case "flagged":
      return item.claimStatus === "flagged";
    case "no_user":
      return item.userId === null;
    case "no_email":
      return item.email === null || item.email.length === 0;
    case "non_gmail":
      return item.email !== null && item.email.length > 0 && !item.isGmail;
    case "duplicate":
      return item.duplicateEmail;
    case "link_active":
      return item.linkStatus === "active";
    case "link_revoked":
      return item.linkStatus === "revoked";
  }
};

export interface CreateClaimLinkInput {
  readonly subjectType: ClaimLinkPersona;
  readonly subjectId: number;
  readonly ttlHours: number;
  readonly adminUserId: number;
}

export interface CreatedClaimLink {
  readonly id: string;
  readonly url: string;
  readonly expiresAt: number;
}

export interface ExchangedClaimLink {
  readonly ticket: string;
  readonly expiresAt: number;
}

/** Admin-issued, per-user claim links. The shared-password `/claim` remains separate. */
export class ClaimLinkService {
  constructor(private readonly ctx: ServiceContext) {}

  async list(input: ClaimDirectoryQuery): Promise<ClaimDirectoryPage> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const now = this.ctx.ports.clock.now();
    const people = await this.ctx.repos.queries.listClaimDirectory(scoped);
    const links = await this.ctx.repos.accounts.listClaimLinksBySchool(
      scoped,
      scoped.tenant.schoolId
    );
    const providers = await this.ctx.repos.queries.listSchoolIdentityProviders(scoped);
    const duplicates = await this.ctx.repos.queries.listDuplicateEmailGroups(scoped);
    const duplicateEmails = new Set(
      duplicates
        .map((row) => normalized(row.email))
        .filter((email) => email.length > 0)
    );

    const providerSet = new Set(providers.map((row) => `${row.userId}:${row.provider}`));
    const latestLink = new Map<string, (typeof links)[number]>();
    for (const link of links) {
      const key =
        link.subjectType !== null && link.subjectId !== null
          ? `${link.subjectType}:${link.subjectId}`
          : link.userId === null
            ? null
            : `user:${link.userId}`;
      if (key === null) continue;
      const previous = latestLink.get(key);
      if (previous === undefined || previous.createdAt < link.createdAt) {
        latestLink.set(key, link);
      }
    }

    const items: ClaimDirectoryItem[] = people.map((row) => {
      const link = latestLink.get(`${row.persona}:${row.recordId}`);
      return {
        persona: row.persona,
        subjectType: row.persona,
        subjectId: row.recordId,
        recordId: row.recordId,
        userId: row.userId,
        fullName: row.fullName,
        email: row.email,
        phone: row.phone,
        claimStatus: row.claimStatus,
        userActive: row.userActive,
        emailVerifiedAt: row.emailVerifiedAt,
        linkedGoogle: row.userId !== null && providerSet.has(`${row.userId}:google`),
        isGmail:
          row.email !== null &&
          /@(gmail|googlemail)\.com$/i.test(row.email.trim()),
        duplicateEmail: row.email !== null && duplicateEmails.has(normalized(row.email)),
        linkStatus: link === undefined ? "none" : linkStatusOf(link, now),
        linkId: link?.id ?? null,
        linkExpiresAt: link?.expiresAt ?? null
      };
    });

    const search = normalized(input.search);
    const filtered = items.filter((item) => {
      if (input.persona !== "all" && item.persona !== input.persona) return false;
      if (!statusMatches(item, input.status)) return false;
      if (search.length === 0) return true;
      return [item.fullName, item.email, item.phone]
        .map(normalized)
        .some((value) => value.includes(search));
    });

    const pageSize = Math.min(Math.max(input.pageSize, 1), 100);
    const page = Math.max(input.page, 1);
    const start = (page - 1) * pageSize;
    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize
    };
  }

  async create(input: CreateClaimLinkInput): Promise<CreatedClaimLink> {
    const config = this.ctx.ports.authConfig;
    if (!config.claimLinkEnabled) throw new ConflictError("Claim links are not enabled");
    if (input.ttlHours < 1 || input.ttlHours > 168) {
      throw new ValidationError("ttlHours must be between 1 and 168", "ttlHours");
    }

    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const subject =
      input.subjectType === "parent"
        ? await this.ctx.repos.queries.findParentClaimSubject(scoped, input.subjectId)
        : await this.ctx.repos.queries.findStaffClaimSubject(scoped, input.subjectId);
    if (subject === null) {
      throw new NotFoundError(input.subjectType, input.subjectId);
    }
    if (subject.userId !== null) {
      const account = await this.ctx.repos.queries.findAccountInTenant(
        scoped,
        subject.userId
      );
      if (account === null) throw new NotFoundError("user", subject.userId);
      if (account.claimStatus === "flagged") {
        throw new ConflictError("This account is flagged for administrative review");
      }
      if (account.claimStatus === "claimed") {
        throw new ConflictError("This account is already claimed");
      }
    }
    const email = subject.email?.trim().toLowerCase() ?? "";
    if (email.length === 0) {
      throw new ValidationError("The record has no email address", "subjectId");
    }

    const now = this.ctx.ports.clock.now();
    const userId =
      subject.userId ?? (await this.ctx.repos.queries.provisionSubjectUser(scoped, subject));
    const token = randomToken();
    const id = crypto.randomUUID();
    const expiresAt = now + input.ttlHours * 3600;
    await this.ctx.repos.accounts.createMagicLink(scoped, {
      id,
      userId,
      email,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      schoolId: scoped.tenant.schoolId,
      createdBy: input.adminUserId,
      tokenHash: await sha256Hex(token),
      purpose: "claim_link",
      expiresAt,
      requestedIp: null,
      createdAt: now
    });
    await emitAuthEvent(
      this.ctx,
      {
        type: "claim_link_issued",
        userId,
        email,
        metadata: {
          claimLinkId: id,
          adminUserId: input.adminUserId,
          ttlHours: input.ttlHours,
          subjectType: input.subjectType,
          subjectId: input.subjectId
        }
      },
      now
    );

    return {
      id,
      url: `${config.appOrigin}/claim#token=${token}`,
      expiresAt
    };
  }

  async revoke(linkId: string): Promise<void> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const link = await this.ctx.repos.accounts.findMagicLinkById(scoped, linkId);
    if (link === null || link.purpose !== "claim_link" || link.schoolId !== scoped.tenant.schoolId) {
      throw new NotFoundError("claim link", linkId);
    }
    const revoked = await this.ctx.repos.accounts.revokeClaimLink(scoped, linkId, this.ctx.ports.clock.now());
    if (!revoked) throw new NotFoundError("claim link", linkId);
    await emitAuthEvent(
      this.ctx,
      {
        type: "claim_link_revoked",
        userId: link.userId,
        email: link.email,
        metadata: { claimLinkId: linkId }
      },
      this.ctx.ports.clock.now()
    );
  }

  async exchange(input: {
    readonly token: string;
    readonly ip: string | null;
    readonly userAgent: string | null;
  }): Promise<ExchangedClaimLink> {
    const config = this.ctx.ports.authConfig;
    if (!config.claimLinkEnabled || config.cookieSecret === null) {
      throw new ConflictError("Claim links are not enabled");
    }
    const unscoped = requireUnscopedContext(this.ctx.repos.ctx);
    const now = this.ctx.ports.clock.now();
    const link = await this.ctx.repos.accounts.consumeMagicLink(
      unscoped,
      await sha256Hex(input.token),
      now,
      "claim_link"
    );
    if (link === null || link.userId === null) {
      throw new AuthError("This claim link is invalid or expired");
    }
    const user = await this.ctx.repos.accounts.findUserById(unscoped, link.userId);
    if (
      user === null ||
      user.activeStatus !== 1 ||
      user.claimStatus === "flagged" ||
      user.claimStatus === "claimed"
    ) {
      throw new AuthError("This claim link is invalid or expired");
    }

    const expiresAt = now + CLAIM_TICKET_TTL_SECONDS;
    const payload: ClaimTicketPayload = {
      purpose: "claim",
      userId: user.id,
      allowEmailChange: true,
      claimLinkId: link.id,
      exp: expiresAt
    };
    const ticket = await signPayload(config.cookieSecret, payload, expiresAt);
    await emitAuthEvent(
      this.ctx,
      {
        type: "claim_link_exchanged",
        userId: user.id,
        email: user.email,
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: { claimLinkId: link.id }
      },
      now
    );
    return { ticket, expiresAt };
  }
}
