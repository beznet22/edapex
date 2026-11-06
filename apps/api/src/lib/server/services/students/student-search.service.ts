import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { TenantScopeError, ValidationError } from "../errors";

export interface StudentSearchInput {
  readonly query?: string;
  readonly limit: number;
}

export interface StudentSummary {
  readonly id: number;
  readonly fullName: string;
  readonly admissionNo: number | null;
  readonly className: string | null;
  readonly sectionName: string | null;
  readonly activeStatus: number | null;
}

export interface StudentSearchResult {
  readonly rows: readonly StudentSummary[];
  readonly nextCursor: string | null;
}

/**
 * Roster and name/admission-number search share the placement query: an empty
 * query lists the active roster, a non-empty query filters within it.
 */
export class StudentSearchService {
  constructor(private readonly ctx: ServiceContext) {}

  async search(input: StudentSearchInput): Promise<StudentSearchResult> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    if (scoped.tenant.classId === null || scoped.tenant.sectionId === null) {
      throw new TenantScopeError("Class and section are required to search students");
    }
    if (!Number.isInteger(input.limit) || input.limit <= 0) {
      throw new ValidationError("A positive limit is required", "limit");
    }
    const limit = Math.min(input.limit, 200);
    const query = input.query?.trim() ?? "";
    const rows = await this.ctx.repos.profiles.listStudentsByClassSection(
      scoped,
      {
        classId: scoped.tenant.classId,
        sectionId: scoped.tenant.sectionId
      },
      query.length === 0 ? undefined : query
    );

    return {
      rows: rows.slice(0, limit).map((row) => ({
        id: row.id,
        fullName: row.name ?? "",
        admissionNo: row.admissionNo,
        className: null,
        sectionName: null,
        activeStatus: null
      })),
      nextCursor: null
    };
  }
}
