import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";

type ResolutionRow = Awaited<
  ReturnType<ServiceContext["repos"]["lifecycle"]["listResolutions"]>
>[number];

export type ResolutionFormat = "json" | "csv";

export interface ResolutionListInput {
  readonly format?: ResolutionFormat | undefined;
  readonly findingId?: string | undefined;
  readonly limit?: number | undefined;
}

export interface ResolutionJsonResult {
  readonly format: "json";
  readonly rows: readonly ResolutionRow[];
}

export interface ResolutionCsvResult {
  readonly format: "csv";
  readonly csv: string;
}

export type ResolutionListResult = ResolutionJsonResult | ResolutionCsvResult;

const COLUMNS = [
  "id",
  "school_id",
  "finding_id",
  "entity",
  "entity_id",
  "before_json",
  "after_json",
  "reason",
  "archive_key",
  "applied_at"
] as const;

const csvValue = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
};

export class ResolutionsService {
  constructor(private readonly ctx: ServiceContext) {}

  async list(input: ResolutionListInput = {}): Promise<ResolutionListResult> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const rows = await this.ctx.repos.lifecycle.listResolutions(scoped, {
      ...(input.findingId === undefined ? {} : { findingId: input.findingId }),
      limit: Math.min(Math.max(input.limit ?? 5000, 1), 10000)
    });
    if ((input.format ?? "json") === "json") return { format: "json", rows };
    const lines = [COLUMNS.join(",")];
    for (const row of rows) {
      lines.push(
        [
          row.id,
          row.schoolId,
          row.findingId,
          row.entity,
          row.entityId,
          row.beforeJson,
          row.afterJson,
          row.reason,
          row.archiveKey,
          row.appliedAt
        ]
          .map(csvValue)
          .join(",")
      );
    }
    return { format: "csv", csv: `${lines.join("\n")}\n` };
  }
}
