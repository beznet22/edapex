import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { ValidationError } from "../errors";

export interface AttendanceRecordInput {
  readonly daysOpened: number;
  readonly daysAbsent: number;
  readonly daysPresent: number;
}

export interface UpsertAttendanceInput {
  readonly studentId: number;
  readonly examTypeId: number;
  readonly attendance: AttendanceRecordInput;
}

export class AttendanceService {
  constructor(private readonly ctx: ServiceContext) {}

  async upsertAttendance(input: UpsertAttendanceInput): Promise<number | null> {
    if (input.studentId <= 0 || input.examTypeId <= 0) {
      throw new ValidationError("Student id and exam type id are required", "studentId");
    }
    const { daysOpened, daysAbsent, daysPresent } = input.attendance;
    for (const [field, value] of [
      ["daysOpened", daysOpened],
      ["daysAbsent", daysAbsent],
      ["daysPresent", daysPresent]
    ] as const) {
      if (!Number.isInteger(value) || value < 0) {
        throw new ValidationError("Attendance values must be non-negative integers", field);
      }
    }
    if (daysPresent + daysAbsent !== daysOpened) {
      throw new ValidationError(
        "Days present plus days absent must equal days opened",
        "attendance"
      );
    }

    const scoped = requireScopedContext(this.ctx.repos.ctx);
    return this.ctx.repos.attendance.upsertClassAttendance(scoped, {
      studentId: input.studentId,
      examTypeId: input.examTypeId,
      daysOpened,
      daysAbsent,
      daysPresent
    });
  }
}
