import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { emitAuthEvent } from "./auth-events";

export type PersonaKind = "student" | "staff" | "parent";

export interface DuplicateAccountView {
  readonly userId: number;
  readonly fullName: string | null;
  readonly email: string | null;
  readonly activeStatus: number | null;
  readonly claimStatus: "pending" | "claimed" | "flagged" | null;
  readonly persona: PersonaKind | "unlinked";
  readonly personas: readonly PersonaKind[];
  readonly sessionCount: number;
  readonly providers: readonly string[];
  readonly lastLoginAt: number | null;
}

export type DuplicateResolution = "unresolved" | "flagged" | "resolved";

export interface DuplicateGroupView {
  readonly email: string;
  readonly resolution: DuplicateResolution;
  readonly accounts: readonly DuplicateAccountView[];
}

export interface ReassignEmailInput {
  readonly email: string;
  readonly targetUserId: number;
}

export interface MergeEmailInput {
  readonly email: string;
  readonly keepUserId: number;
  readonly mergeUserIds: readonly number[];
}

const normaliseEmail = (email: string): string => {
  const value = email.trim().toLowerCase();
  if (value.length === 0 || !value.includes("@")) {
    throw new ValidationError("A valid email address is required", "email");
  }
  return value;
};

const requireUserId = (value: number, field: string): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError(`${field} must be a positive integer`, field);
  }
  return value;
};

const resolutionOf = (accounts: readonly DuplicateAccountView[]): DuplicateResolution => {
  if (accounts.some((account) => account.claimStatus === "flagged")) return "flagged";
  if (accounts.length > 0 && accounts.every((account) => account.claimStatus === "claimed")) {
    return "resolved";
  }
  return "unresolved";
};

const csvCell = (value: string | number | null): string => {
  const text = value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** `04a §5`: the queue is driven by linkage, never by `users.usertype`. */
export class DuplicateEmailService {
  constructor(private readonly ctx: ServiceContext) {}

  async list(): Promise<readonly DuplicateGroupView[]> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const now = this.ctx.ports.clock.now();
    const groups = await this.ctx.repos.queries.listDuplicateEmailGroups(scoped);
    const emails = groups.flatMap((group) => (group.email === null ? [] : [group.email]));
    if (emails.length === 0) return [];

    const accounts = await this.ctx.repos.queries.listAccountsForEmails(scoped, emails);
    const userIds = accounts.map((account) => account.userId);
    const links = await this.ctx.repos.queries.listPersonaLinks(scoped, userIds);
    const sessions = await this.ctx.repos.queries.listSessionCounts(scoped, userIds, now);
    const providers = await this.ctx.repos.queries.listIdentityProviders(scoped, userIds);
    const logins = await this.ctx.repos.queries.listLastLogins(scoped, userIds);

    const personasByUser = new Map<number, PersonaKind[]>();
    for (const link of links) {
      const existing = personasByUser.get(link.userId) ?? [];
      existing.push(link.persona);
      personasByUser.set(link.userId, existing);
    }
    const sessionsByUser = new Map(sessions.map((row) => [row.userId, row.total]));
    const providersByUser = new Map<number, string[]>();
    for (const row of providers) {
      const existing = providersByUser.get(row.userId) ?? [];
      existing.push(row.provider);
      providersByUser.set(row.userId, existing);
    }
    const loginsByUser = new Map(logins.map((row) => [row.userId, row.lastLoginAt]));

    const views: DuplicateAccountView[] = accounts.map((account) => {
      const personas = personasByUser.get(account.userId) ?? [];
      return {
        userId: account.userId,
        fullName: account.fullName,
        email: account.email,
        activeStatus: account.activeStatus,
        claimStatus: account.claimStatus,
        persona: personas[0] ?? "unlinked",
        personas,
        sessionCount: sessionsByUser.get(account.userId) ?? 0,
        providers: providersByUser.get(account.userId) ?? [],
        lastLoginAt: loginsByUser.get(account.userId) ?? null
      };
    });

    const viewsByEmail = new Map<string, DuplicateAccountView[]>();
    for (const view of views) {
      if (view.email === null) continue;
      const key = view.email.trim().toLowerCase();
      const existing = viewsByEmail.get(key) ?? [];
      existing.push(view);
      viewsByEmail.set(key, existing);
    }

    return emails
      .map((email) => {
        const key = email.trim().toLowerCase();
        const groupAccounts = viewsByEmail.get(key) ?? [];
        return {
          email: key,
          resolution: resolutionOf(groupAccounts),
          accounts: groupAccounts
        };
      })
      .filter((group) => group.accounts.length > 1);
  }

  async reassign(input: ReassignEmailInput): Promise<void> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const now = this.ctx.ports.clock.now();
    const email = normaliseEmail(input.email);
    const targetUserId = requireUserId(input.targetUserId, "targetUserId");
    const target = await this.ctx.repos.queries.findAccountInTenant(scoped, targetUserId);
    if (target === null) throw new NotFoundError("user", targetUserId);

    const holders = await this.ctx.repos.queries.listAccountsForEmails(scoped, [email]);
    const cleared = holders
      .map((holder) => holder.userId)
      .filter((userId) => userId !== targetUserId);

    await this.ctx.repos.profiles.reassignEmail(scoped, {
      targetUserId,
      otherUserIds: cleared,
      email
    });
    await emitAuthEvent(
      this.ctx,
      {
        type: "account_reassign",
        userId: targetUserId,
        email,
        metadata: { targetUserId, cleared: cleared.length }
      },
      now
    );
  }

  async merge(input: MergeEmailInput): Promise<void> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const now = this.ctx.ports.clock.now();
    const email = normaliseEmail(input.email);
    const keepUserId = requireUserId(input.keepUserId, "keepUserId");
    if (input.mergeUserIds.length === 0) {
      throw new ValidationError("At least one account must be merged", "mergeUserIds");
    }
    const losers = [...new Set(input.mergeUserIds)];
    for (const loser of losers) requireUserId(loser, "mergeUserIds");
    if (losers.includes(keepUserId)) {
      throw new ValidationError("The surviving account cannot also be merged", "mergeUserIds");
    }

    const holders = await this.ctx.repos.queries.listAccountsForEmails(scoped, [email]);
    const holderIds = new Set(holders.map((holder) => holder.userId));
    if (!holderIds.has(keepUserId)) {
      throw new ValidationError("The surviving account does not hold this address", "keepUserId");
    }
    for (const loser of losers) {
      if (!holderIds.has(loser)) {
        throw new ValidationError("Every merged account must share this address", "mergeUserIds");
      }
    }

    const links = await this.ctx.repos.queries.listPersonaLinks(scoped, losers);
    if (links.length > 0) {
      throw new ConflictError(
        "An account with a student, staff or parent record cannot be merged; reassign the email instead"
      );
    }

    await this.ctx.repos.accounts.mergeAccounts(scoped, {
      keepUserId,
      loserUserIds: losers,
      email
    });
    await emitAuthEvent(
      this.ctx,
      {
        type: "account_merge",
        userId: keepUserId,
        email,
        metadata: { keepUserId, merged: losers.length }
      },
      now
    );
  }

  async flag(userId: number): Promise<void> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const now = this.ctx.ports.clock.now();
    const target = requireUserId(userId, "userId");
    const account = await this.ctx.repos.queries.findAccountInTenant(scoped, target);
    if (account === null) throw new NotFoundError("user", target);

    await this.ctx.repos.accounts.flagAccountForReview(scoped, target);
    await emitAuthEvent(
      this.ctx,
      { type: "account_flagged", userId: target, email: account.email },
      now
    );
  }

  async exportCsv(): Promise<string> {
    const groups = await this.list();
    const header = [
      "email",
      "user_id",
      "full_name",
      "active_status",
      "claim_status",
      "persona",
      "personas",
      "sessions",
      "providers",
      "last_login",
      "resolution"
    ].join(",");
    const rows = groups.flatMap((group) =>
      group.accounts.map((account) =>
        [
          group.email,
          account.userId,
          account.fullName,
          account.activeStatus,
          account.claimStatus,
          account.persona,
          account.personas.join("|"),
          account.sessionCount,
          account.providers.join("|"),
          account.lastLoginAt,
          group.resolution
        ]
          .map(csvCell)
          .join(",")
      )
    );
    return [header, ...rows].join("\n");
  }
}
