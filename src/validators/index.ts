/**
 * ==========================================
 * Layer: VALIDATORS
 * Protocol: @backend-security-coder, @api-patterns
 * ==========================================
 * Purpose:
 *   Data structure enforcement mechanisms defining exactly what payload shapes
 *   are acceptable. Controllers rely on these validators to parse HTTP data safely.
 * 
 * Constraints:
 *   - ALL external input must be evaluated using `zod` schemas.
 *   - NO application business logic goes here—only structural shaping, regex trimming,
 *     and data primitive requirements.
 *   - Filename convention: `camelCase.schema.ts`.
 */

// export * from './auth.schema.ts';
