/**
 * ==========================================
 * Layer: MIDDLEWARE
 * Protocol: @backend-security-coder, @backend-dev-guidelines
 * ==========================================
 * Purpose:
 *   Contains global and route-specific functions that intercept requests BEFORE
 *   they reach the Controller. All logic regarding security, access restriction,
 *   and traffic shaping belongs here.
 * 
 * Rules/Scope:
 *   - Global Error Interceptor (Sentry propagation).
 *   - Auth checking (Better-Auth session parsing).
 *   - Permission Based Access Control (PBAC / RBAC).
 *   - Route-level rate limiting (`token bucket` / `sliding window`).
 */

// export * from './authMiddleware';
