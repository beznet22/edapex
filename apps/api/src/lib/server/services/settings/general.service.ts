import { z } from "zod";

import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { ValidationError } from "../errors";
import { parseOrThrow } from "../validation";

type GeneralSettingRow = Awaited<
  ReturnType<ServiceContext["repos"]["school"]["selectGeneralSettingBySchoolId"]>
>;

const patchSchema = z
  .object({
    schoolName: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    logo: z.string().nullable().optional(),
    identity: z.string().nullable().optional(),
    academicId: z.number().int().nonnegative().nullable().optional(),
    sessionId: z.number().int().nonnegative().nullable().optional(),
    languageId: z.number().int().nonnegative().nullable().optional(),
    dateFormatId: z.number().int().nonnegative().nullable().optional()
  })
  .strict();

export class GeneralSettingsService {
  constructor(private readonly ctx: ServiceContext) {}

  async getGeneralSettings(): Promise<GeneralSettingRow> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    return this.ctx.repos.school.selectGeneralSettingBySchoolId(
      scoped,
      scoped.tenant.schoolId
    );
  }

  async saveGeneralSettings(patch: Readonly<Record<string, unknown>>): Promise<GeneralSettingRow> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const parsed = await parseOrThrow(
      () => patchSchema.parseAsync(patch),
      "General settings validation failed"
    );
    if (Object.keys(parsed).length === 0) {
      return this.getGeneralSettings();
    }
    await this.ctx.repos.school.updateGeneralSettings(scoped, parsed);
    return this.ctx.repos.school.selectGeneralSettingBySchoolId(
      scoped,
      scoped.tenant.schoolId
    );
  }

  async resolveSchoolIdentity(
    schoolId: number
  ): Promise<{ readonly name: string; readonly email: string; readonly phone: string }> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    if (schoolId !== scoped.tenant.schoolId) {
      throw new ValidationError("School id does not match the tenant", "schoolId");
    }
    const school = await this.ctx.repos.school.findSchoolInfo(scoped);
    return {
      name: school?.schoolName ?? "Your School",
      email: school?.email ?? "noreply@school.local",
      phone: school?.phone ?? ""
    };
  }
}
