import type { ServiceContext } from "../context";
import { requireScopedContext, requireUnscopedContext } from "../context";
import { sha256Hex } from "../crypto/digest";
import { AuthError, ConflictError, NotFoundError, ValidationError } from "../errors";
import { emitAuthEvent } from "./auth-events";
import {
  STUDENT_CODE_ALPHABET,
  STUDENT_CODE_LENGTH,
  generateStudentCode,
  normaliseCode
} from "./code-normalisation";
import { codePrefixOf, consumeCodeAttempt } from "./claim-policy";
import { assertNotLimited, recordFailure, resetLimit } from "./rate-limit-policy";
import { issueSession, loadAuthUser } from "./session-issuance";
import type { AuthSessionResult } from "./types";

export const MAX_BULK_CODES = 1_000;

export interface IssueCodesInput {
  readonly studentIds: readonly number[];
  readonly actorUserId: number;
}

export interface IssuedStudentCode {
  readonly studentId: number;
  readonly userId: number;
  readonly fullName: string | null;
  readonly admissionNo: number | null;
  readonly className: string | null;
  readonly sectionName: string | null;
  readonly code: string;
}

interface CodeStudent {
  readonly studentId: number;
  readonly userId: number | null;
  readonly fullName: string | null;
  readonly admissionNo: number | null;
  readonly className: string | null;
  readonly sectionName: string | null;
}

interface CodeRow {
  readonly id: string;
  readonly subjectType: "student";
  readonly subjectId: number;
  readonly codeHash: string;
  readonly expiresAt: null;
  readonly revokedAt: null;
  readonly lastUsedAt: null;
  readonly issuedBy: number;
  readonly createdAt: number;
}

export interface RedeemCodeInput {
  readonly code: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly fingerprint: string | null;
}

const uniqueStudentIds = (studentIds: readonly number[]): readonly number[] => {
  const seen = new Set<number>();
  const unique: number[] = [];
  for (const id of studentIds) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new ValidationError("Student ids must be positive integers", "studentIds");
    }
    if (!seen.has(id)) {
      seen.add(id);
      unique.push(id);
    }
  }
  return unique;
};

const requireActor = (actorUserId: number): number => {
  if (!Number.isInteger(actorUserId) || actorUserId <= 0) {
    throw new ValidationError("A positive actor user id is required", "actorUserId");
  }
  return actorUserId;
};

const requireLinkedAccount = (student: CodeStudent): number => {
  if (student.userId === null) {
    throw new ValidationError(
      `Student ${student.studentId} has no linked account`,
      "studentIds"
    );
  }
  return student.userId;
};

const issued = (student: CodeStudent, code: string): IssuedStudentCode => ({
  studentId: student.studentId,
  userId: requireLinkedAccount(student),
  fullName: student.fullName,
  admissionNo: student.admissionNo,
  className: student.className,
  sectionName: student.sectionName,
  code
});

/** Scoped code administration (`04a §4`); plaintext is returned exactly once. */
export class StudentCodeService {
  constructor(private readonly ctx: ServiceContext) {}

  async issue(input: IssueCodesInput): Promise<readonly IssuedStudentCode[]> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const actorUserId = requireActor(input.actorUserId);
    const ids = uniqueStudentIds(input.studentIds);
    if (ids.length === 0) {
      throw new ValidationError("At least one student id is required", "studentIds");
    }
    if (ids.length > MAX_BULK_CODES) {
      throw new ValidationError(
        `Bulk issuance is capped at ${MAX_BULK_CODES} students per request`,
        "studentIds"
      );
    }

    const now = this.ctx.ports.clock.now();
    const students = await this.ctx.repos.queries.listStudentCodeExportRows(scoped, ids);
    if (students.length !== ids.length) {
      const found = new Set(students.map((student) => student.studentId));
      const missing = ids.find((id) => !found.has(id));
      throw new NotFoundError("student", missing ?? ids[0] ?? 0);
    }

    for (const student of students) requireLinkedAccount(student);

    const codes = new Map<number, string>();
    const codeRows: CodeRow[] = [];
    for (const student of students) {
      const code = generateStudentCode();
      codes.set(student.studentId, code);
      codeRows.push({
        id: crypto.randomUUID(),
        subjectType: "student",
        subjectId: student.studentId,
        codeHash: await sha256Hex(code),
        expiresAt: null,
        revokedAt: null,
        lastUsedAt: null,
        issuedBy: actorUserId,
        createdAt: now
      });
    }

    await this.ctx.repos.accounts.revokeActiveCodes(scoped, ids, now);
    await this.ctx.repos.accounts.insertAuthCodes(scoped, codeRows);
    await this.ctx.repos.accounts.createAuthEvents(
      scoped,
      students.map((student) => ({
        id: crypto.randomUUID(),
        type: "code_issued",
        userId: student.userId,
        email: null,
        ip: null,
        userAgent: null,
        metadata: JSON.stringify({ studentId: student.studentId, actorUserId }),
        createdAt: now
      }))
    );

    return students.map((student) =>
      issued(student, codes.get(student.studentId) ?? "")
    );
  }

  async reissue(studentId: number, actorUserId: number): Promise<IssuedStudentCode> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const actor = requireActor(actorUserId);
    const now = this.ctx.ports.clock.now();
    const student = await this.requireStudent(studentId);
    const userId = requireLinkedAccount(student);
    const code = generateStudentCode();

    await this.ctx.repos.accounts.replaceStudentCode(scoped, {
      studentId,
      userId,
      code: {
        id: crypto.randomUUID(),
        subjectType: "student",
        subjectId: studentId,
        codeHash: await sha256Hex(code),
        expiresAt: null,
        revokedAt: null,
        lastUsedAt: null,
        issuedBy: actor,
        createdAt: now
      },
      event: {
        id: crypto.randomUUID(),
        type: "code_reissued",
        userId,
        email: null,
        ip: null,
        userAgent: null,
        metadata: JSON.stringify({ studentId, actorUserId: actor }),
        createdAt: now
      },
      now
    });
    return issued(student, code);
  }

  async revoke(studentId: number, actorUserId: number): Promise<void> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const actor = requireActor(actorUserId);
    const now = this.ctx.ports.clock.now();
    const student = await this.requireStudent(studentId);
    const userId = requireLinkedAccount(student);

    await this.ctx.repos.accounts.revokeStudentCode(scoped, {
      studentId,
      userId,
      event: {
        id: crypto.randomUUID(),
        type: "code_revoked",
        userId,
        email: null,
        ip: null,
        userAgent: null,
        metadata: JSON.stringify({ studentId, actorUserId: actor }),
        createdAt: now
      },
      now
    });
  }

  private async requireStudent(studentId: number): Promise<CodeStudent> {
    if (!Number.isInteger(studentId) || studentId <= 0) {
      throw new ValidationError("A positive student id is required", "studentId");
    }
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const [student] = await this.ctx.repos.queries.listStudentCodeExportRows(scoped, [
      studentId
    ]);
    if (student === undefined) throw new NotFoundError("student", studentId);
    return student;
  }
}

/**
 * Pre-tenant redemption (`04 §3.3`). The code is a durable credential: it is
 * hashed, rate-limited per IP and per 4-character prefix, revocable, and never
 * consumed on use.
 */
export class StudentCodeSignInService {
  constructor(private readonly ctx: ServiceContext) {}

  async redeem(input: RedeemCodeInput): Promise<AuthSessionResult> {
    const unscoped = requireUnscopedContext(this.ctx.repos.ctx);
    const now = this.ctx.ports.clock.now();
    const normalised = normaliseCode(input.code);
    const wellFormed =
      normalised.length === STUDENT_CODE_LENGTH &&
      [...normalised].every((character) => STUDENT_CODE_ALPHABET.includes(character));

    if (!wellFormed) {
      await emitAuthEvent(
        this.ctx,
        {
          type: "code_failure",
          ip: input.ip,
          userAgent: input.userAgent,
          metadata: { reason: "malformed" }
        },
        now
      );
      throw new AuthError("Invalid code");
    }

    const prefix = codePrefixOf(normalised);
    const failureKey = `code-fail:${prefix}`;
    await consumeCodeAttempt(this.ctx, prefix, input.ip, now);
    await assertNotLimited(this.ctx, failureKey, now);
    await emitAuthEvent(
      this.ctx,
      {
        type: "code_attempt",
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: { prefix }
      },
      now
    );

    const code = await this.ctx.repos.accounts.findAuthCodeByHash(
      unscoped,
      await sha256Hex(normalised),
      now
    );
    if (code === null || code.subjectType !== "student") {
      await recordFailure(this.ctx, failureKey, now);
      await emitAuthEvent(
        this.ctx,
        {
          type: "code_failure",
          ip: input.ip,
          userAgent: input.userAgent,
          metadata: { prefix, reason: "not_found" }
        },
        now
      );
      throw new AuthError("Invalid code");
    }

    const student = await this.ctx.repos.queries.findStudentAccount(unscoped, code.subjectId);
    const user =
      student !== null && student.userId !== null
        ? await this.ctx.repos.accounts.findUserById(unscoped, student.userId)
        : null;

    if (student === null || user === null || user.activeStatus !== 1) {
      await recordFailure(this.ctx, failureKey, now);
      await emitAuthEvent(
        this.ctx,
        {
          type: "code_failure",
          ip: input.ip,
          userAgent: input.userAgent,
          metadata: { prefix, reason: "no_active_account" }
        },
        now
      );
      throw new AuthError("Invalid code");
    }

    if (user.claimStatus === "flagged") {
      await emitAuthEvent(
        this.ctx,
        {
          type: "code_failure",
          userId: user.id,
          ip: input.ip,
          userAgent: input.userAgent,
          metadata: { prefix, reason: "flagged" }
        },
        now
      );
      throw new ConflictError(
        "This account is under administrative review; contact the school administrator"
      );
    }

    await this.ctx.repos.accounts.touchAuthCodeUsed(unscoped, code.id, now);
    await resetLimit(this.ctx, failureKey);

    const session = await issueSession(this.ctx, user.id, {
      ip: input.ip,
      userAgent: input.userAgent,
      fingerprint: input.fingerprint
    });
    await emitAuthEvent(
      this.ctx,
      {
        type: "code_success",
        userId: user.id,
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: { studentId: code.subjectId, sessionId: session.sessionId }
      },
      now
    );
    return { ...session, user: await loadAuthUser(this.ctx, user) };
  }
}
