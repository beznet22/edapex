/**
 * Bindings for `edapex-cowork-api`.
 *
 * `AGENT_DB` and `SYNC_MEDIA` exist only here. The school `DB` is not bound to
 * this Worker at all, so a bug in agent code has no path to a student record.
 */
export interface AppEnv {
  readonly AGENT_DB: D1Database;
  readonly SYNC_MEDIA: R2Bucket;
  /**
   * Service binding to `services/sms-api`.
   *
   * Used for one thing: resolving the `__Host-edapex_session` cookie. The
   * session lives in the school database, which this Worker must not hold, so
   * authentication is delegated rather than duplicated.
   */
  readonly SMS_API: Fetcher;
  readonly API_ORIGIN: string;
}

export interface AppVariables {
  userId: string;
}

export type AppContext = {
  Bindings: AppEnv;
  Variables: AppVariables;
};
