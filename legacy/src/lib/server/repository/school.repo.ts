import { eq } from "drizzle-orm";
import { smSchools } from "$lib/server/db/sms-schema";
import { BaseRepository } from "./base.repo";

export interface SchoolInfo {
  schoolName: string | null;
  email: string | null;
  phone: string | null;
}

export class SchoolRepository extends BaseRepository {
  async getSchoolInfo(schoolId: number): Promise<SchoolInfo | null> {
    const [row] = await this.db
      .select({
        schoolName: smSchools.schoolName,
        email: smSchools.email,
        phone: smSchools.phone,
      })
      .from(smSchools)
      .where(eq(smSchools.id, schoolId))
      .limit(1);
    return row ?? null;
  }
}
