/**
 * ==========================================
 * Layer: MIDDLEWARE — Edge Rate Limiter
 * ==========================================
 * Purpose:
 *   In-memory sliding window rate limiter.
 *   Protects D1 infrastructure from DDoS and runaway AI agents.
 *
 * STRESS AWARENESS:
 *   - 50/min human, 1000/min AI (configurable via UnifiedConfig).
 *   - Returns 429 with `Retry-After` header.
 *   - Minimal memory footprint: per-IP Map with automatic cleanup.
 *   - Edge-safe: no Node.js dependencies.
 */

import type { MiddlewareHandler } from "hono";
import { logger } from "../utils/logger.js";

const log = logger.child({ layer: "middleware" });

interface SlidingWindow {
  timestamps: number[];
  lastCleanup: number;
}

const windows = new Map<string, SlidingWindow>();
const WINDOW_MS = 60_000; // 1 minute
const CLEANUP_INTERVAL_MS = 120_000; // 2 minutes

function cleanupOldEntries(window: SlidingWindow, now: number): void {
  const cutoff = now - WINDOW_MS;
  // Binary search for cutoff would be optimal, but linear is fine at these volumes
  while (window.timestamps.length > 0 && window.timestamps[0]! < cutoff) {
    window.timestamps.shift();
  }
  window.lastCleanup = now;
}

/**
 * Determine the rate limit for the request.
 * AI agents are identified by the `X-Agent-Id` or `X-Request-Source: ai` header.
 */
function getLimit(isAi: boolean, humanPerMinute: number, aiPerMinute: number): number {
  return isAi ? aiPerMinute : humanPerMinute;
}

export interface RateLimiterConfig {
  humanPerMinute: number;
  aiPerMinute: number;
}

export function rateLimiter(config: RateLimiterConfig): MiddlewareHandler {
  return async (c, next) => {
    const now = Date.now();
    const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "unknown";
    const isAi = !!(c.req.header("x-agent-id") || c.req.header("x-request-source") === "ai");
    const limit = getLimit(isAi, config.humanPerMinute, config.aiPerMinute);

    // Get or create sliding window
    let window = windows.get(ip);
    if (!window) {
      window = { timestamps: [], lastCleanup: now };
      windows.set(ip, window);
    }

    // Periodic cleanup to prevent unbounded memory growth
    if (now - window.lastCleanup > CLEANUP_INTERVAL_MS) {
      cleanupOldEntries(window, now);
    } else {
      // Remove expired timestamps
      const cutoff = now - WINDOW_MS;
      while (window.timestamps.length > 0 && window.timestamps[0]! < cutoff) {
        window.timestamps.shift();
      }
    }

    // Check rate limit
    if (window.timestamps.length >= limit) {
      const retryAfterMs = window.timestamps[0]! + WINDOW_MS - now;
      const retryAfterSec = Math.ceil(retryAfterMs / 1000);

      log.warn("Rate limit exceeded", { ip, limit, isAi, retryAfterSec });

      c.header("Retry-After", String(retryAfterSec));
      c.header("X-RateLimit-Limit", String(limit));
      c.header("X-RateLimit-Remaining", "0");
      return c.json({ error: "Rate limit exceeded", retryAfterSec }, 429);
    }

    // Record this request
    window.timestamps.push(now);

    // Set rate limit headers
    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", String(limit - window.timestamps.length));

    await next();
  };
}

/** Clear all rate limit windows — useful for testing. */
export function clearRateLimitWindows(): void {
  windows.clear();
}
