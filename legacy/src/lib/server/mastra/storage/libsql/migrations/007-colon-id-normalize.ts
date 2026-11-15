/**
 * Migration 007_colon_id_normalize — rewrites any remaining colon-format
 * model_id values to the canonical slash format.
 *
 * The V1 cookie format and pre-consolidation DB rows stored model ids as
 * `groq:llama-3.3-70b-versatile`. After Phase 5 the resolver accepts
 * slash only (`groq/llama-3.3-70b-versatile`), so any colon-format rows
 * still present in the unified tables would resolve to `null` and surface
 * as a `ModelNotFoundError` at request time. This migration rewrites
 * those rows in place.
 *
 * Applies to:
 *   - encrypted_credentials.model_id (where not null)
 *   - model_visibility.model_id (where not null)
 *   - provider_access_policy.model_id (where not null)
 *
 * Idempotent: re-running finds no remaining colon-format rows because
 * the UPDATE matches only `model_id LIKE '%:%' AND model_id NOT LIKE '%/%'`.
 */
export const MIGRATION_007_COLON_ID_NORMALIZE_SQL = `
UPDATE encrypted_credentials
   SET model_id = replace(model_id, ':', '/')
 WHERE model_id LIKE '%:%'
   AND model_id NOT LIKE '%/%';

UPDATE model_visibility
   SET model_id = replace(model_id, ':', '/')
 WHERE model_id LIKE '%:%'
   AND model_id NOT LIKE '%/%';

UPDATE provider_access_policy
   SET model_id = replace(model_id, ':', '/')
 WHERE model_id LIKE '%:%'
   AND model_id NOT LIKE '%/%';
`;

export const MIGRATION_007_ID = '007_colon_id_normalize';
export const MIGRATION_007_NAME = 'normalize remaining colon-format model_ids to slash format';
