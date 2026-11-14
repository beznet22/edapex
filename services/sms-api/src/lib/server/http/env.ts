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
  /**
   * Service binding to `services/model-router`.
   *
   * A binding rather than a URL: the model router has no public hostname, so it
   * cannot be reached from a browser or from anywhere outside this account.
   */
  readonly MODEL_ROUTER?: Fetcher;
  /** Shared secret expected by `model-router`'s bearer check. */
  readonly MODEL_ROUTER_SECRET?: string;
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
