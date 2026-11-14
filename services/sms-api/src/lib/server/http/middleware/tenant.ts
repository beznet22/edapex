import type { MiddlewareHandler } from "hono";

import type { AppContext } from "../env";
import { createServiceContext } from "../../services/context";
import { createService } from "../../services/context";
import {
  AuthError,
  PermissionError,
  TenantScopeError,
  ValidationError
} from "../../services/errors";
import { TenantScopeService } from "../../services/tenant";
import { TENANT_SCOPE_MESSAGE } from "../errors";

const parseHeaderId = (
  c: Parameters<MiddlewareHandler<AppContext>>[0],
  name: string
): number | null => {
  const raw = c.req.header(name);
  if (raw === undefined || raw.trim().length === 0) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError(`${name} must be a positive integer`, name);
  }
  return value;
};

export const createTenantMiddleware = (
  createContext: typeof createServiceContext
): MiddlewareHandler<AppContext> => async (c, next) => {
  const user = c.get("user");
  if (user === null) throw new AuthError();
  if (user.schoolId === null) {
    throw new PermissionError("Your account is not attached to a school");
  }

  const academicId = parseHeaderId(c, "X-Academic-Id");
  if (academicId === null) {
    throw new ValidationError("X-Academic-Id is required", "X-Academic-Id");
  }
  const classId = parseHeaderId(c, "X-Class-Id");
  const sectionId = parseHeaderId(c, "X-Section-Id");
  if ((classId === null) !== (sectionId === null)) {
    throw new TenantScopeError(TENANT_SCOPE_MESSAGE);
  }

  const tenant = {
    schoolId: user.schoolId,
    userId: user.id,
    staffId: user.staffId,
    designationId: user.designationId,
    roleId: user.roleId,
    academicId,
    classId,
    sectionId
  };
  const base = c.get("baseCtx");
  const scoped = createContext(c.env, tenant, {
    cache: base.cache,
    logger: base.logger
  });
  c.set("tenant", tenant);
  c.set("ctx", scoped);
  await createService(TenantScopeService, scoped).assertScope();
  await next();
};

export const requireClassScope: MiddlewareHandler<AppContext> = async (c, next) => {
  const tenant = c.get("tenant");
  if (tenant === null || tenant.classId === null || tenant.sectionId === null) {
    throw new TenantScopeError(TENANT_SCOPE_MESSAGE);
  }
  await next();
};
