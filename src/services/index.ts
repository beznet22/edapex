/**
 * ==========================================
 * Layer: SERVICES (BUSINESS LOGIC)
 * Protocol: @backend-architect, @backend-dev-guidelines
 * ==========================================
 * Purpose:
 *   The heart of the application's domain complexity.
 *   Services define the "rules" of the system and coordinate:
 *     1. Multi-Agent dispatch routines (HMAS).
 *     2. Domain Event emissions.
 *     3. Data persistence via injected Repositories.
 * 
 * Constraints:
 *   - A Service MUST be strictly HTTP-agnostic (no `req` or `res` objects).
 *   - A Service MUST receive DB dependencies via constructor injection.
 *   - Filename convention: `camelCaseService.ts`.
 */

// export * from './authService';
