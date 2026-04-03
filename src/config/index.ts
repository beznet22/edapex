/**
 * ==========================================
 * Layer: CONFIGURATION
 * Protocol: @backend-dev-guidelines
 * ==========================================
 * Purpose:
 *   Centralized configuration management (`unifiedConfig`).
 *   This is the ONLY allowed source of truth for environment variables
 *   and feature flags. Directly accessing `process.env` in controllers
 *   or services is strictly forbidden to prevent fragmented configurations.
 *
 * Dependencies:
 *   - Zod (for env validation)
 *   - dotenv (optional based on runtime)
 */

/**
 * Runtime execution mode.
 *   - "production"  — Full operational mode.
 *   - "development" — Debug-level logging, relaxed rate limits.
 *   - "stress_lab"  — Restricted laboratory mode for stress testing.
 */
export type AppMode = "production" | "development" | "stress_lab";

export interface UnifiedConfig {
  mode: AppMode;
  isStressLab: boolean;

  /** Rate limiting thresholds per minute */
  rateLimits: {
    humanPerMinute: number;
    aiPerMinute: number;
  };

  /** Heartbeat routine engine interval (ms) */
  heartbeatIntervalMs: number;

  /** AI budget defaults */
  ai: {
    maxTokensPerTask: number;
    maxCostCentsPerTask: number;
    defaultProvider: string;
  };
}

/**
 * Build unified config from environment bindings.
 * Call at app boot from the Hono env context.
 */
export function buildConfig(env: Record<string, string | undefined>): UnifiedConfig {
  const rawMode = (env.MODE ?? env.NODE_ENV ?? "development").toLowerCase();
  const mode: AppMode =
    rawMode === "stress_lab" ? "stress_lab" : rawMode === "production" ? "production" : "development";

  return {
    mode,
    isStressLab: mode === "stress_lab",
    rateLimits: {
      humanPerMinute: mode === "stress_lab" ? 10 : 50,
      aiPerMinute: mode === "stress_lab" ? 100 : 1000,
    },
    heartbeatIntervalMs: Number(env.HEARTBEAT_INTERVAL_MS ?? 30_000),
    ai: {
      maxTokensPerTask: Number(env.AI_MAX_TOKENS_PER_TASK ?? 8192),
      maxCostCentsPerTask: Number(env.AI_MAX_COST_CENTS_PER_TASK ?? 50),
      defaultProvider: env.AI_DEFAULT_PROVIDER ?? "workers-ai",
    },
  };
}

/** Default config for development — override at boot via `buildConfig()`. */
export const unifiedConfig: UnifiedConfig = buildConfig({});
