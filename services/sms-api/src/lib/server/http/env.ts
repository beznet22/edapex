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
  /** Fan-out queue: one message per event, consumed by `pushDelivery`. */
  readonly PUSH_QUEUE?: Queue<import("@edapex/contracts/push").PushEvent>;
  /** Shared secret `cowork-api` presents on `/internal/push`. */
  readonly INTERNAL_PUSH_SECRET?: string;
  /** Firebase service-account JSON. A secret, never a var. */
  readonly FCM_SERVICE_ACCOUNT?: string;
  readonly FCM_PROJECT_ID?: string;
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
  /** Validated by `agentModelHeaders`, never read inline in a route. */
  providerSelector: string | null;
  acceptHeader: string;
  /** Resolved by `ocrConsent`; true only for an explicit `X-OCR-Consent: cloud`. */
  cloudOcrConsented: boolean;
}

export type AppContext = {
  Bindings: AppEnv;
  Variables: AppVariables;
};
