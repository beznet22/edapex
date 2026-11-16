import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import type { StaffListRow, StaffPatch } from "../../repository/profiles/staff";
import { clampLimit, decodeCursor, encodeCursor, toPage, type Page } from "../../repository/base/pagination";

/**
 * Staff records: list, read, create, update, retire.
 *
 * # What this service does not do
 *
 * It never creates a `users` row. The legacy system created a user and a password inline
 * with the staff record; that is explicitly retired (`01a §7`, and the docstring on
 * `createStaff`). An account is granted separately through a claim link, so "this person
 * exists" and "this person can sign in" stay two decisions — which matters when an admin
 * adds a teacher before their school email exists.
 *
 * # Retire, not delete
 *
 * `sm_staffs.id` is referenced by marks, attendance, timetables and archives. A hard delete
 * orphans all of it, so `retire` sets `active_status = 0`: the record and its history stay,
 * the person leaves every list, and their account stops working.
 */
export interface StaffListQuery {
  readonly query?: string;
  readonly departmentId?: number;
  readonly designationId?: number;
  readonly includeInactive?: boolean;
  readonly cursor?: string;
  readonly limit: number;
}

export interface CreateStaffInput {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string | null;
  readonly mobile: string | null;
  readonly designationId: number | null;
  readonly departmentId: number | null;
  readonly roleId: number | null;
  readonly genderId: number | null;
  readonly dateOfBirth: string | null;
  readonly qualification: string | null;
  readonly experience: string | null;
}

export interface StaffView {
  readonly id: number;
  readonly fullName: string | null;
  readonly email: string | null;
  readonly mobile: string | null;
  readonly designationId: number | null;
  readonly designation: string | null;
  readonly department: string | null;
  readonly roleId: number | null;
  readonly active: boolean;
  readonly staffPhoto: string | null;
  readonly hasAccount: boolean;
}

const toView = (row: StaffListRow): StaffView => ({
  id: row.id,
  fullName: row.fullName,
  email: row.email,
  mobile: row.mobile,
  designationId: row.designationId,
  designation: row.designation,
  department: row.department,
  roleId: row.roleId,
  active: row.activeStatus === 1,
  staffPhoto: row.staffPhoto,
  hasAccount: row.userId !== null
});

export class StaffService {
  constructor(private readonly ctx: ServiceContext) {}

  async list(input: StaffListQuery): Promise<Page<StaffView> & { readonly total: number }> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const limit = clampLimit(input.limit);
    const afterId = decodeCursor(input.cursor);

    const rows = await this.ctx.repos.profiles.listStaff(scoped, {
      ...(input.query === undefined ? {} : { query: input.query }),
      ...(input.departmentId === undefined ? {} : { departmentId: input.departmentId }),
      ...(input.designationId === undefined ? {} : { designationId: input.designationId }),
      ...(input.includeInactive === undefined ? {} : { includeInactive: input.includeInactive }),
      afterId,
      limit
    });

    // The repository fetches `limit + 1` to prove there is a next page; the count is a
    // second query because a keyset cursor cannot answer "how many pages are there".
    const total = await this.ctx.repos.profiles.countStaff(scoped, {
      ...(input.query === undefined ? {} : { query: input.query }),
      ...(input.departmentId === undefined ? {} : { departmentId: input.departmentId }),
      ...(input.designationId === undefined ? {} : { designationId: input.designationId }),
      ...(input.includeInactive === undefined ? {} : { includeInactive: input.includeInactive })
    });
    const page = toPage(rows, limit, (row) => row.id);
    return { rows: page.rows.map(toView), nextCursor: page.nextCursor, total };
  }

  async get(staffId: number): Promise<StaffView> {
    if (!Number.isInteger(staffId) || staffId <= 0) {
      throw new ValidationError("A positive staff id is required", "staffId");
    }
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const row = await this.ctx.repos.profiles.findStaffById(scoped, staffId);
    if (row === null) throw new NotFoundError("Staff member", staffId);

    return {
      id: row.id,
      fullName: row.fullName,
      email: row.email,
      mobile: row.mobile,
      designationId: row.designationId,
      designation: null,
      department: null,
      roleId: row.roleId,
      active: row.activeStatus === 1,
      staffPhoto: row.staffPhoto,
      hasAccount: row.userId !== null
    };
  }

  async create(input: CreateStaffInput): Promise<StaffView> {
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    if (firstName.length === 0) {
      throw new ValidationError("A first name is required", "firstName");
    }
    if (lastName.length === 0) {
      throw new ValidationError("A last name is required", "lastName");
    }
    if (
      (input.email === null || input.email.length === 0) &&
      (input.mobile === null || input.mobile.length === 0)
    ) {
      // Neither contact means there is no way to reach the person, and no way to send them
      // a claim link. Requiring one is a product rule, not a schema constraint.
      throw new ValidationError("An email address or a mobile number is required", "email");
    }

    const scoped = requireScopedContext(this.ctx.repos.ctx);
    if (input.email !== null && input.email.length > 0) {
      const existing = await this.ctx.repos.profiles.findStaffByEmail(scoped, input.email);
      if (existing !== null) {
        throw new ConflictError("A staff member with that email already exists");
      }
    }

    const staffId = await this.ctx.repos.profiles.createStaff(scoped, {
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,
      email: input.email,
      mobile: input.mobile,
      /*
       * Every one of these is nullable but defaults to `1` and foreign-keys to another
       * table, so omitting one writes `1` and the insert fails when no row with that id
       * exists. Passing `null` explicitly is the only way to say "not set" — the same trap
       * `sm_parents` has.
       */
      designationId: input.designationId,
      departmentId: input.departmentId,
      roleId: input.roleId,
      genderId: input.genderId,
      userId: null,
      parentId: null,
      dateOfBirth: input.dateOfBirth,
      qualification: input.qualification,
      experience: input.experience,
      activeStatus: 1
    });

    return await this.get(staffId);
  }

  async update(staffId: number, patch: StaffPatch): Promise<StaffView> {
    await this.get(staffId);
    const scoped = requireScopedContext(this.ctx.repos.ctx);

    if (patch.email !== undefined && patch.email !== null && patch.email.length > 0) {
      const existing = await this.ctx.repos.profiles.findStaffByEmail(scoped, patch.email);
      // A different staff member already holding the address is a conflict; the same person
      // re-submitting their own email is not.
      if (existing !== null && existing.id !== staffId) {
        throw new ConflictError("Another staff member already uses that email");
      }
    }

    await this.ctx.repos.profiles.updateStaff(scoped, staffId, patch);
    return await this.get(staffId);
  }

  /** What the UI calls "Remove". Never a hard delete. */
  async setActive(staffId: number, active: boolean): Promise<StaffView> {
    await this.get(staffId);
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const changed = await this.ctx.repos.profiles.updateStaffStatus(scoped, staffId, active);
    if (!changed) throw new NotFoundError("Staff member", staffId);
    return await this.get(staffId);
  }
}

export { encodeCursor };
