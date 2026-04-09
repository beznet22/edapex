/**
 * ==========================================
 * Layer: UTILITIES — 8-Layer Trace Logger
 * ==========================================
 * Purpose:
 *   Structured logger supporting the 8-layer architecture namespace
 *   and mandatory `run_id` for agentic trace correlation.
 *
 * Layers:
 *   1. config       — Configuration loading
 *   2. middleware    — Edge middleware (auth, rate limiting)
 *   3. route        — Hono route handlers
 *   4. controller   — BaseController actions
 *   5. service      — Business logic services
 *   6. domain       — Domain interfaces / validation
 *   7. repository   — Database access layer
 *   8. util         — Utility / helper functions
 *
 * STRESS AWARENESS: Minimal allocations per log call.
 * Edge-safe: no Node.js-only APIs.
 */

export type LogLayer =
  | "config"
  | "middleware"
  | "route"
  | "controller"
  | "service"
  | "domain"
  | "repository"
  | "events"
  | "ai"
  | "util";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  layer: LogLayer;
  runId?: string;
  tenantId?: string;
  userId?: string;
  sessionId?: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  child(ctx: Partial<LogContext>): Logger;
}

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** Global minimum log level — set via `setLogLevel()` or defaults to "info". */
let globalMinLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  globalMinLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[globalMinLevel];
}

const RESERVED_CTX_KEYS = new Set(["layer", "runId", "tenantId", "userId", "sessionId"]);

function formatLog(
  level: LogLevel,
  ctx: LogContext,
  message: string,
  data?: Record<string, unknown>,
): string {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    layer: ctx.layer,
    msg: message,
  };
  if (ctx.runId) entry.run_id = ctx.runId;
  if (ctx.tenantId) entry.tenant_id = ctx.tenantId;
  if (ctx.userId) entry.user_id = ctx.userId;
  if (ctx.sessionId) entry.session_id = ctx.sessionId;
  // Forward any additional context keys (e.g. agentId, taskId)
  for (const key of Object.keys(ctx)) {
    if (!RESERVED_CTX_KEYS.has(key)) {
      entry[key] = ctx[key];
    }
  }
  if (data) entry.data = data;
  return JSON.stringify(entry);
}

function createLogger(ctx: LogContext): Logger {
  return {
    debug(message: string, data?: Record<string, unknown>) {
      if (shouldLog("debug")) console.debug(formatLog("debug", ctx, message, data));
    },
    info(message: string, data?: Record<string, unknown>) {
      if (shouldLog("info")) console.info(formatLog("info", ctx, message, data));
    },
    warn(message: string, data?: Record<string, unknown>) {
      if (shouldLog("warn")) console.warn(formatLog("warn", ctx, message, data));
    },
    error(message: string, data?: Record<string, unknown>) {
      if (shouldLog("error")) console.error(formatLog("error", ctx, message, data));
    },
    child(childCtx: Partial<LogContext>): Logger {
      return createLogger({ ...ctx, ...childCtx });
    },
  };
}

/**
 * Root logger instance. Create layer-scoped children:
 *
 * @example
 *   const log = logger.child({ layer: 'service', runId: 'abc-123' });
 *   log.info('Heartbeat tick', { cycle: 1 });
 */
export const logger: Logger = createLogger({ layer: "util" });
