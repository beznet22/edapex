import type {
  AuthUser,
  ServiceContext,
  ServiceEnv,
  SessionView
} from "../services";

export interface AppEnv extends ServiceEnv {
  readonly DB: D1Database;
  readonly MEDIA: R2Bucket;
  readonly CORS_ORIGINS?: string;
}

export interface AppVariables {
  requestId: string;
  ip: string | null;
  userAgent: string | null;
  wantsHtml: boolean;
  wantsCsv: boolean;
  baseCtx: ServiceContext;
  ctx: ServiceContext;
  session: SessionView | null;
  sessionToken: string | null;
  user: AuthUser | null;
  tenant: ServiceContext["tenant"];
}

export type AppContext = {
  Bindings: AppEnv;
  Variables: AppVariables;
};
