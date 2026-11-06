import { drizzle } from "drizzle-orm/d1";

import * as schema from "../../db/schema";
import {
  createEmptyConfigCache,
  createRepositoryContext,
  createUnscopedContext
} from "../../repository/base";
import { listStudentsByClassSection } from "../../repository/profiles";
import { findReportSettings, upsertReportSettings } from "../../repository/school";
import { CloudflareEmailAdapter } from "../adapters/cloudflare-email.adapter";
import { D1ReportSettingsAdapter } from "../adapters/d1-report-settings.adapter";
import { MistralOcrAdapter } from "../adapters/mistral-ocr.adapter";
import { TenantScopeError } from "../errors";
import { systemClock } from "../ports";
import type { ReportSettingsStore, ServicePorts, StudentDirectory } from "../ports";
import { consoleLogger } from "./logger";
import type { Logger } from "./logger";
import { ServiceCache } from "./service-context";
import type { RepositoryAccess, ServiceContext, ServiceEnv } from "./service-context";
import { createRepositoryAccess, requireScopedContext } from "./service-context";

export interface ServiceContextOverrides {
  readonly ports?: Partial<ServicePorts>;
  readonly logger?: Logger;
  readonly cache?: ServiceCache;
}

const unavailableReportSettings: ReportSettingsStore = {
  async get() {
    throw new TenantScopeError("Report settings require a tenant context");
  },
  async save() {
    throw new TenantScopeError("Report settings require a tenant context");
  }
};

const unavailableStudents: StudentDirectory = {
  async listRoster() {
    throw new TenantScopeError("Roster reads require a tenant context");
  }
};

function createPorts(env: ServiceEnv, repos: RepositoryAccess): ServicePorts {
  const scoped = repos.ctx.tenant === null ? null : requireScopedContext(repos.ctx);

  const reportSettings: ReportSettingsStore =
    scoped === null
      ? unavailableReportSettings
      : new D1ReportSettingsAdapter({
          find: async () => {
            const row = await findReportSettings(scoped);
            return row === null ? null : { payload: row.payload, updatedAt: row.updatedAt };
          },
          upsert: async (payload, updatedAt) => {
            await upsertReportSettings(scoped, payload, updatedAt);
          }
        });

  const students: StudentDirectory =
    scoped === null
      ? unavailableStudents
      : {
          listRoster: async (query) => {
            if (
              scoped.tenant.academicId !== null &&
              query.academicId !== scoped.tenant.academicId
            ) {
              throw new TenantScopeError(
                "The requested academic year does not match the tenant context"
              );
            }
            const rows = await listStudentsByClassSection(scoped, {
              classId: query.classId,
              sectionId: query.sectionId
            });
            return rows.map((row) => ({
              id: row.id,
              name: row.name ?? "",
              admissionNo: row.admissionNo
            }));
          }
        };

  return {
    email: new CloudflareEmailAdapter({
      binding: env.EMAIL,
      from: env.EMAIL_FROM ?? "noreply@edapex.local"
    }),
    ocr: new MistralOcrAdapter({
      apiKey: env.MISTRAL_API_KEY,
      model: env.MISTRAL_OCR_MODEL,
      baseUrl: env.MISTRAL_API_BASE_URL
    }),
    reportSettings,
    clock: systemClock,
    students
  };
}

/**
 * The per-request composition root. A null tenant produces the explicitly
 * unscoped context used by login/claim; everything else is school-scoped.
 */
export function createServiceContext(
  env: ServiceEnv,
  tenant: ServiceContext["tenant"],
  overrides: ServiceContextOverrides = {}
): ServiceContext {
  const repositoryCtx =
    tenant === null
      ? createUnscopedContext(env, createEmptyConfigCache())
      : createRepositoryContext(
          drizzle(env.DB, { schema }),
          tenant,
          createEmptyConfigCache()
        );

  const repos = createRepositoryAccess(repositoryCtx);
  const ports: ServicePorts = Object.freeze({
    ...createPorts(env, repos),
    ...(overrides.ports ?? {})
  });

  return Object.freeze({
    repos,
    ports,
    config: repositoryCtx.config,
    cache: overrides.cache ?? new ServiceCache(),
    logger: overrides.logger ?? consoleLogger,
    tenant: repositoryCtx.tenant
  });
}
