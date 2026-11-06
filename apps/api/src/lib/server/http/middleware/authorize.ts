import type { Context, MiddlewareHandler } from "hono";

import { AuthorizationService, createService } from "../../services";
import { AuthError, PermissionError } from "../../services/errors";
import type { AppContext } from "../env";

export const requireAdmin: MiddlewareHandler<AppContext> = async (c, next) => {
  const user = c.get("user");
  if (user === null) throw new AuthError();
  const isAdmin = await createService(
    AuthorizationService,
    c.get("baseCtx")
  ).isAdmin(user.id);
  if (!isAdmin) throw new PermissionError();
  await next();
};

export const currentUserId = (c: Context<AppContext>): number => {
  const user = c.get("user");
  if (user === null) throw new AuthError();
  return user.id;
};

export const retrievalActor = (
  c: Context<AppContext>
): { readonly userId: number; readonly isStaff: boolean } => {
  const user = c.get("user");
  if (user === null) throw new AuthError();
  return { userId: user.id, isStaff: user.staffId !== null };
};

export const staffIdOf = (c: Context<AppContext>): number => {
  const user = c.get("user");
  if (user === null) throw new AuthError();
  if (user.staffId === null) throw new PermissionError("A staff account is required");
  return user.staffId;
};

export const requireStaff: MiddlewareHandler<AppContext> = async (c, next) => {
  staffIdOf(c);
  await next();
};
