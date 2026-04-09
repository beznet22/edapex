import { logger } from "../../utils/logger.js";
import type { IAttendanceRepository } from "../../domain/interfaces/attendance.interface.js";

const log = logger.child({ layer: "service", domain: "attendance" });

export class AttendanceService {
  constructor(private repo: IAttendanceRepository) {}

  async recordAttendance(tenantId: string, data: any[]) {
    log.info("Recording attendance bulk", { tenantId, count: data.length });
    return this.repo.bulkSaveStudentAttendance(data.map(d => ({ ...d, tenantId })));
  }

  async getDailyAttendance(tenantId: string, date: string) {
    return this.repo.getDailyAttendanceStats(tenantId, date);
  }
}
