/**
 * Server-only connector implementations.
 *
 * Imported by `services/cowork-api` and nothing else. The spec forbids connector
 * code, credentials and catalogue in any app bundle, and
 * `apps/web/tests/dependency-boundary.test.ts` fails the build if this package
 * appears in one.
 */
export * from "./catalogue";
export * from "./google";
export * from "./mcp";
