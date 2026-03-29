/**
 * ==========================================
 * Layer: CONTROLLERS
 * Protocol: @api-design-principles, @backend-dev-guidelines
 * ==========================================
 * Purpose:
 *   Request coordination layer. Controllers must contain ZERO business logic.
 *   Their only responsibilities are:
 *     1. Parsing incoming HTTP requests (params, body, query).
 *     2. Delegating validated execution to the `services` layer.
 *     3. Formatting successful responses via standard HTTP envelopes.
 *     4. Propagating exceptions to the BaseController's error handler.
 * 
 * Requirements:
 *   - ALL controllers MUST extend `BaseController`.
 *   - Controllers MUST NOT access Prisma/Drizzle directly.
 *   - Filename convention: `PascalCaseController.ts`.
 */

// export * from './auth.controller'; 
