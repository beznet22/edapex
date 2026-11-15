import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { ConflictError, NotFoundError, ValidationError } from "../errors";

/**
 * Guardian links between a student and a parent record.
 *
 * `sm_students.parent_id` is the link. A parent row can be shared — two siblings point at
 * the same `sm_parents.id` — so detaching clears the student's pointer and leaves the parent
 * intact. Deleting the parent would silently orphan the sibling.
 *
 * # Dedupe by email
 *
 * Attaching a guardian by email matches an existing parent rather than creating a second
 * one. The legacy system created duplicates this way and the migration still carries repair
 * steps for them (`transform/people.mjs` D1/F1); repeating the mistake here would put rows
 * back that someone has already cleaned up.
 */
export interface GuardianView {
  readonly parentId: number;
  readonly name: string | null;
  readonly email: string | null;
  readonly mobile: string | null;
  readonly hasAccount: boolean;
}

export interface AttachGuardianInput {
  readonly studentId: number;
  /** Either an existing parent id, or the fields to create one. */
  readonly parentId?: number;
  readonly name?: string;
  readonly email?: string | null;
  readonly mobile?: string | null;
  readonly relation?: string | null;
}

export class StudentGuardianService {
  constructor(private readonly ctx: ServiceContext) {}

  async attach(input: AttachGuardianInput): Promise<GuardianView> {
    if (!Number.isInteger(input.studentId) || input.studentId <= 0) {
      throw new ValidationError("A positive student id is required", "studentId");
    }
    const scoped = requireScopedContext(this.ctx.repos.ctx);

    const student = await this.ctx.repos.queries.findStudentDetails(scoped, input.studentId);
    if (student === null) throw new NotFoundError("Student", input.studentId);

    const parentId = await this.resolveParentId(input);

    const updated = await this.ctx.repos.profiles.updateStudent(scoped, input.studentId, {
      parentId
    });
    if (updated === null) throw new NotFoundError("Student", input.studentId);

    /*
     * Read the row back rather than echoing the request: when an existing parent was matched
     * by email, the caller's name/mobile are not what got stored, and returning them would
     * show a guardian that does not exist.
     */
    const after = await this.ctx.repos.queries.findStudentDetails(scoped, input.studentId);
    if (after === null || after.parentId === null) {
      throw new NotFoundError("Guardian link", input.studentId);
    }

    const identity =
      after.guardiansEmail === null || after.guardiansEmail.length === 0
        ? null
        : await this.ctx.repos.profiles.findParentByEmail(scoped, after.guardiansEmail);

    return {
      parentId: after.parentId,
      name: after.guardiansName,
      email: after.guardiansEmail,
      mobile: after.guardiansMobile,
      hasAccount: identity !== null && identity.userId !== null
    };
  }

  async detach(studentId: number): Promise<void> {
    if (!Number.isInteger(studentId) || studentId <= 0) {
      throw new ValidationError("A positive student id is required", "studentId");
    }
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const student = await this.ctx.repos.queries.findStudentDetails(scoped, studentId);
    if (student === null) throw new NotFoundError("Student", studentId);

    const updated = await this.ctx.repos.profiles.updateStudent(scoped, studentId, {
      parentId: null
    });
    if (updated === null) throw new NotFoundError("Student", studentId);
  }

  /** Existing id wins; then an email match; then a new row. */
  private async resolveParentId(input: AttachGuardianInput): Promise<number> {
    if (input.parentId !== undefined) {
      if (!Number.isInteger(input.parentId) || input.parentId <= 0) {
        throw new ValidationError("A positive parent id is required", "parentId");
      }
      return input.parentId;
    }

    const name = input.name?.trim() ?? "";
    if (name.length === 0) {
      throw new ValidationError(
        "Provide an existing parent id, or a guardian name to create one",
        "name"
      );
    }

    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const email = input.email ?? null;
    if (email !== null && email.trim().length > 0) {
      const existing = await this.ctx.repos.profiles.findParentByEmail(scoped, email.trim());
      if (existing !== null) {
        const linked = await this.ctx.repos.queries.findStudentDetails(scoped, input.studentId);
        if (linked?.parentId === existing.parentId) {
          throw new ConflictError("That guardian is already linked to this student");
        }
        return existing.parentId;
      }
    }

    return await this.ctx.repos.profiles.createParent(scoped, {
      guardiansName: name,
      guardiansEmail: email,
      guardiansMobile: input.mobile ?? null,
      guardiansRelation: input.relation ?? null,
      academicId: scoped.tenant.academicId
    });
  }
}
