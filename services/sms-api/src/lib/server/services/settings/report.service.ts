import { z } from "zod";

import type { ServiceContext } from "../context";
import { ValidationError } from "../errors";
import type { ReportSettings, ReportSettingsPatch } from "../ports";
import { parseOrThrow } from "../validation";

const patchSchema = z
  .object({
    termlyReportTitle: z.string().optional(),
    annualReportTitle: z.string().optional(),
    principalName: z.string().optional(),
    supportEmail: z.string().optional(),
    resultEmailSubject: z.string().optional()
  })
  .strict();

export class ReportSettingsService {
  constructor(private readonly ctx: ServiceContext) {}

  async getReportSettings(): Promise<ReportSettings> {
    return this.ctx.ports.reportSettings.get();
  }

  async saveReportSettings(
    patch: Readonly<Record<string, unknown>>,
    updatedBy: number
  ): Promise<ReportSettings> {
    if (!Number.isInteger(updatedBy) || updatedBy <= 0) {
      throw new ValidationError("A positive user id is required", "updatedBy");
    }
    const parsed = await parseOrThrow(
      () => patchSchema.parseAsync(patch),
      "Report settings validation failed"
    );
    const next: ReportSettingsPatch = {
      ...(parsed.termlyReportTitle === undefined
        ? {}
        : { termlyReportTitle: parsed.termlyReportTitle }),
      ...(parsed.annualReportTitle === undefined
        ? {}
        : { annualReportTitle: parsed.annualReportTitle }),
      ...(parsed.principalName === undefined
        ? {}
        : { principalName: parsed.principalName }),
      ...(parsed.supportEmail === undefined
        ? {}
        : { supportEmail: parsed.supportEmail }),
      ...(parsed.resultEmailSubject === undefined
        ? {}
        : { resultEmailSubject: parsed.resultEmailSubject })
    };
    return this.ctx.ports.reportSettings.save(next, updatedBy);
  }
}
