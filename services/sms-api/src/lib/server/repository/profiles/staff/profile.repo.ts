import { and, eq, gt, like, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import { smDesignations, smHumanDepartments, smStaffs } from "../../../db/schema";
import { DbEntityNotFoundError } from "../../base/errors";
import { withErrorHandling } from "../../base/error-handling";
import type { ScopedRepositoryContext } from "../../base/repository-context";

export type StaffRow = typeof smStaffs.$inferSelect;
export type NewStaff = typeof smStaffs.$inferInsert;

/** Tenant and audit columns are owned by the repository, never by the caller. */
export type NewStaffInput = Omit<NewStaff, "id" | "schoolId" | "createdBy" | "updatedBy">;

/** Fields a profile update may touch; `userId` and `schoolId` are immutable here. */
export type StaffPatch = Partial<
  Pick<
    NewStaff,
    | "firstName"
    | "lastName"
    | "mobile"
    | "email"
    | "qualification"
    | "experience"
    | "dateOfBirth"
    | "designationId"
    | "departmentId"
    | "roleId"
    | "genderId"
    | "activeStatus"
  >
>;

export interface StaffSearchFilters {
  readonly departmentId?: number;
  readonly designationId?: number;
}

/** One row in the admin staff list. Carries enough to render without a second query. */
export interface StaffListRow {
  readonly id: number;
  readonly fullName: string | null;
  readonly email: string | null;
  readonly mobile: string | null;
  readonly designationId: number | null;
  readonly designation: string | null;
  readonly department: string | null;
  readonly roleId: number | null;
  readonly activeStatus: number | null;
  readonly staffPhoto: string | null;
  /** Null when the staff record has no linked account. */
  readonly userId: number | null;
}

export interface StaffSearchRow {
  readonly id: number;
  readonly teacherId: number;
  readonly fullName: string | null;
  readonly email: string | null;
  readonly designation: string | null;
  readonly department: string | null;
}

export interface StaffUpdateResult {
  readonly success: boolean;
  readonly staffId: number;
  readonly fullName: string;
}

export async function findStaffById(
  ctx: ScopedRepositoryContext,
  id: number
): Promise<StaffRow | null> {
  if (id <= 0) return null;
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(smStaffs)
      .where(and(eq(smStaffs.id, id), eq(smStaffs.schoolId, ctx.tenant.schoolId)))
      .limit(1);
    return row ?? null;
  }, "findStaffById");
}

export async function findStaffByEmail(
  ctx: ScopedRepositoryContext,
  email: string
): Promise<StaffRow | null> {
  if (email.length === 0) return null;
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(smStaffs)
      .where(and(eq(smStaffs.email, email), eq(smStaffs.schoolId, ctx.tenant.schoolId)))
      .limit(1);
    return row ?? null;
  }, "findStaffByEmail");
}

/**
 * Creates the staff record only. The user row, claim digest and persona
 * linkage are orchestrated by Phase 3 (the legacy inline user+password
 * creation is retired with password auth, `01a §7`).
 */
export async function createStaff(
  ctx: ScopedRepositoryContext,
  input: NewStaffInput
): Promise<number> {
  return withErrorHandling(async () => {
    const rows = await ctx.db
      .insert(smStaffs)
      .values({ ...input, schoolId: ctx.tenant.schoolId })
      .returning({ id: smStaffs.id });
    const [row] = rows;
    if (row === undefined) throw new DbEntityNotFoundError("Staff", "new");
    return row.id;
  }, "createStaff");
}

export async function updateStaff(
  ctx: ScopedRepositoryContext,
  staffId: number,
  patch: StaffPatch
): Promise<StaffUpdateResult> {
  return withErrorHandling(async () => {
    const [staff] = await ctx.db
      .select()
      .from(smStaffs)
      .where(and(eq(smStaffs.id, staffId), eq(smStaffs.schoolId, ctx.tenant.schoolId)))
      .limit(1);
    if (staff === undefined) throw new DbEntityNotFoundError("Staff", staffId);

    const firstName = patch.firstName ?? staff.firstName;
    const lastName = patch.lastName ?? staff.lastName;
    const fullName = `${firstName ?? ""} ${lastName ?? ""}`.trim();
    const update = {
      ...patch,
      ...(patch.firstName !== undefined || patch.lastName !== undefined ? { fullName } : {})
    };

    if (Object.keys(update).length > 0) {
      await ctx.db
        .update(smStaffs)
        .set(update)
        .where(and(eq(smStaffs.id, staffId), eq(smStaffs.schoolId, ctx.tenant.schoolId)));
    }
    return { success: true, staffId, fullName };
  }, "updateStaff");
}

export async function updateStaffPhoto(
  ctx: ScopedRepositoryContext,
  staffId: number,
  photoPath: string
): Promise<boolean> {
  return withErrorHandling(async () => {
    const rows = await ctx.db
      .update(smStaffs)
      .set({ staffPhoto: photoPath })
      .where(and(eq(smStaffs.id, staffId), eq(smStaffs.schoolId, ctx.tenant.schoolId)))
      .returning({ id: smStaffs.id });
    return rows.length > 0;
  }, "updateStaffPhoto");
}

export async function searchStaff(
  ctx: ScopedRepositoryContext,
  filters: StaffSearchFilters
): Promise<readonly StaffSearchRow[]> {
  return withErrorHandling(async () => {
    if (filters.departmentId === undefined && filters.designationId === undefined) {
      return [];
    }
    const conditions = [
      eq(smStaffs.activeStatus, 1),
      eq(smStaffs.schoolId, ctx.tenant.schoolId)
    ];
    if (filters.departmentId !== undefined) {
      conditions.push(eq(smStaffs.departmentId, filters.departmentId));
    }
    if (filters.designationId !== undefined) {
      conditions.push(eq(smStaffs.designationId, filters.designationId));
    }

    return ctx.db
      .select({
        id: smStaffs.id,
        teacherId: smStaffs.id,
        fullName: smStaffs.fullName,
        email: smStaffs.email,
        designation: smDesignations.title,
        department: smHumanDepartments.name
      })
      .from(smStaffs)
      .leftJoin(smDesignations, eq(smStaffs.designationId, smDesignations.id))
      .leftJoin(smHumanDepartments, eq(smStaffs.departmentId, smHumanDepartments.id))
      .where(and(...conditions));
  }, "searchStaff");
}

/**
 * The admin staff list.
 *
 * Distinct from `searchStaff`, which returns `[]` unless a department or designation is
 * supplied — it exists for the "who teaches in this department" picker, not for a roster of
 * everybody. An admin list has to work with no filters at all.
 *
 * Keyset pagination on `id`, per the repository contract: no `OFFSET`. `includeInactive`
 * is explicit because the default view is people who still work here, and a soft-deleted
 * row must not reappear just because a filter was cleared.
 */
export async function listStaff(
  ctx: ScopedRepositoryContext,
  options: {
    readonly query?: string;
    readonly departmentId?: number;
    readonly designationId?: number;
    readonly includeInactive?: boolean;
    readonly afterId?: number | null;
    readonly limit: number;
  }
): Promise<readonly StaffListRow[]> {
  return withErrorHandling(async () => {
    const conditions = [eq(smStaffs.schoolId, ctx.tenant.schoolId)];
    if (options.includeInactive !== true) {
      conditions.push(eq(smStaffs.activeStatus, 1));
    }
    if (options.departmentId !== undefined) {
      conditions.push(eq(smStaffs.departmentId, options.departmentId));
    }
    if (options.designationId !== undefined) {
      conditions.push(eq(smStaffs.designationId, options.designationId));
    }
    if (options.afterId !== undefined && options.afterId !== null) {
      conditions.push(gt(smStaffs.id, options.afterId));
    }
    if (options.query !== undefined && options.query.trim().length > 0) {
      const pattern = `%${options.query.trim()}%`;
      conditions.push(
        or(
          like(smStaffs.fullName, pattern),
          like(smStaffs.email, pattern),
          like(smStaffs.mobile, pattern)
        ) as SQL<unknown>
      );
    }

    return ctx.db
      .select({
        id: smStaffs.id,
        fullName: smStaffs.fullName,
        email: smStaffs.email,
        mobile: smStaffs.mobile,
        designationId: smStaffs.designationId,
        designation: smDesignations.title,
        department: smHumanDepartments.name,
        roleId: smStaffs.roleId,
        activeStatus: smStaffs.activeStatus,
        staffPhoto: smStaffs.staffPhoto,
        userId: smStaffs.userId
      })
      .from(smStaffs)
      .leftJoin(smDesignations, eq(smStaffs.designationId, smDesignations.id))
      .leftJoin(smHumanDepartments, eq(smStaffs.departmentId, smHumanDepartments.id))
      .where(and(...conditions))
      .orderBy(smStaffs.id)
      .limit(options.limit + 1);
  }, "listStaff");
}

/** Staff record only; the user's active status is an accounts concern. */
export async function updateStaffStatus(
  ctx: ScopedRepositoryContext,
  staffId: number,
  active: boolean
): Promise<boolean> {
  return withErrorHandling(async () => {
    const rows = await ctx.db
      .update(smStaffs)
      .set({ activeStatus: active ? 1 : 0 })
      .where(and(eq(smStaffs.id, staffId), eq(smStaffs.schoolId, ctx.tenant.schoolId)))
      .returning({ id: smStaffs.id });
    return rows.length > 0;
  }, "updateStaffStatus");
}

/** Staff record only; user deletion is orchestrated separately. */
export async function deleteStaff(
  ctx: ScopedRepositoryContext,
  staffId: number
): Promise<boolean> {
  return withErrorHandling(async () => {
    const rows = await ctx.db
      .delete(smStaffs)
      .where(and(eq(smStaffs.id, staffId), eq(smStaffs.schoolId, ctx.tenant.schoolId)))
      .returning({ id: smStaffs.id });
    return rows.length > 0;
  }, "deleteStaff");
}
