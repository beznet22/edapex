/**
 * TelegramAdminLogger — forwards important bot events to a private
 * admin chat on Telegram.
 *
 * Features:
 *   - Opt-in via the `TELEGRAM_ADMIN_CHAT_ID` env var. When unset, the
 *     logger is a no-op (the existing `console.warn` calls continue
 *     to write to the server log).
 *   - Token-bucket rate limit: max N events per M ms (default 20 per
 *     60s). Excess events are dropped silently.
 *   - Dedup window: identical `source + normalized message` within
 *     K ms (default 5 min) collapse to a single Telegram message
 *     with a suppressed-count summary at window expiry.
 *   - In-memory ring buffer (`log-buffer.ts`) backs the `/logs` admin
 *     command and survives HMR.
 *   - Never throws. The Telegram adapter can fail; the bot must not.
 *
 * Production note: this is a thin bridge to Telegram. For real
 * observability (retention, alerting, dashboards), wire Sentry /
 * Axiom / OpenTelemetry alongside this. Out of scope for this slice.
 */
import { createHash } from "node:crypto";
import { telegramAdapter } from "./bot";
import { getLogBuffer, type LogEntry, type LogLevel } from "./log-buffer";

const DEFAULT_BURST = 20;
const DEFAULT_RATE_MS = 60_000;
const DEFAULT_DEDUP_MS = 5 * 60_000;
const DEFERRED_QUEUE_CAP = 50;

export interface AdminLoggerConfig {
  chatId: string;
  burst: number;
  refillMs: number;
  dedupMs: number;
}

interface DedupBucket {
  count: number;
  firstSentAt: number;
  lastEmittedAt: number;
  /** The "canonical" message we already sent; we use it for the summary. */
  canonicalMessage: string;
}

class TelegramAdminLogger {
  private readonly config: AdminLoggerConfig | null;
  private tokens: number;
  private lastRefillAt: number;
  private dedup: Map<string, DedupBucket>;
  private readonly deferred: LogEntry[] = [];

  constructor(config: AdminLoggerConfig | null) {
    this.config = config;
    this.tokens = config?.burst ?? DEFAULT_BURST;
    this.lastRefillAt = Date.now();
    this.dedup = new Map();
  }

  private get enabled(): boolean {
    return this.config !== null && this.config.chatId.trim() !== "";
  }

  warn(source: string, message: string, context?: Record<string, unknown>): Promise<void> {
    return this.emit("warn", source, message, context);
  }

  error(source: string, err: unknown, context?: Record<string, unknown>): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    return this.emit("error", source, message, { ...context, stack: err instanceof Error ? err.stack : undefined });
  }

  info(source: string, message: string, context?: Record<string, unknown>): Promise<void> {
    return this.emit("info", source, message, context);
  }

  /** For HMR / shutdown — flush any deferred messages. */
  async flush(): Promise<void> {
    if (!this.enabled) return;
    while (this.deferred.length > 0) {
      const next = this.deferred.shift();
      if (!next) break;
      await this.postToTelegram(next);
    }
  }

  private async emit(
    level: LogLevel,
    source: string,
    rawMessage: string,
    context?: Record<string, unknown>,
  ): Promise<void> {
    // Always push to the in-memory buffer — even when forwarding is off
    // (so /logs can still show recent events during dev).
    const entry: LogEntry = {
      ts: Date.now(),
      level,
      source,
      message: rawMessage,
      ...(context !== undefined ? { context } : {}),
    };
    getLogBuffer().push(entry);

    if (!this.enabled) {
      // Fall back to the standard server log so the event is still
      // captured by whatever log-aggregator the deployment uses.
      logToConsole(level, source, rawMessage, context);
      return;
    }

    const cfg = this.config as AdminLoggerConfig;
    const signature = makeSignature(source, rawMessage);
    const now = Date.now();

    // Dedup check.
    const bucket = this.dedup.get(signature);
    if (bucket && now - bucket.lastEmittedAt < cfg.dedupMs) {
      bucket.count += 1;
      bucket.lastEmittedAt = now;
      return;
    }
    if (bucket && now - bucket.lastEmittedAt >= cfg.dedupMs) {
      // Window expired — emit the summary, then start a new bucket.
      const summary = `${bucket.canonicalMessage}\n\n_suppressed ${bucket.count} duplicate(s) in last ${Math.round(cfg.dedupMs / 60_000)}min_`;
      this.dedup.delete(signature);
      await this.forwardOrQueue({
        ...entry,
        message: summary,
        ts: now,
      });
    }

    // Token bucket refill.
    this.refillTokens(cfg);
    if (this.tokens <= 0) {
      // Rate-limited. Drop silently. The ring buffer still has the event.
      return;
    }
    this.tokens -= 1;

    // Start a fresh dedup bucket.
    this.dedup.set(signature, {
      count: 0,
      firstSentAt: now,
      lastEmittedAt: now,
      canonicalMessage: rawMessage,
    });

    await this.forwardOrQueue(entry);
  }

  private refillTokens(cfg: AdminLoggerConfig): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillAt;
    if (elapsed <= 0) return;
    const refillAmount = (elapsed / cfg.refillMs) * cfg.burst;
    this.tokens = Math.min(cfg.burst, this.tokens + refillAmount);
    this.lastRefillAt = now;
  }

  private async forwardOrQueue(entry: LogEntry): Promise<void> {
    try {
      await this.postToTelegram(entry);
    } catch (err) {
      // Telegram failed (e.g. cold start, network blip, 429). Queue
      // for the next flush, capped at DEFERRED_QUEUE_CAP.
      if (this.deferred.length < DEFERRED_QUEUE_CAP) {
        this.deferred.push(entry);
      } else {
        // Drop the oldest deferred entry to make room.
        this.deferred.shift();
        this.deferred.push(entry);
      }
      logToConsole("warn", "telegram/admin-logger", `deferred post: ${errMessage(err)}`);
    }
  }

  private async postToTelegram(entry: LogEntry): Promise<void> {
    if (!this.config) return;
    const text = formatMarkdownV2(entry);
    await telegramAdapter.postMessage(this.config.chatId, text);
  }
}

function makeSignature(source: string, message: string): string {
  return createHash("sha1").update(`${source}|${normalizeMessage(message)}`).digest("hex");
}

const NUMERIC_RE = /\b\d+\b/g;
const HEX_RE = /\b[a-f0-9]{16,}\b/gi;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

function normalizeMessage(message: string): string {
  return message
    .replace(UUID_RE, "<uuid>")
    .replace(HEX_RE, "<hex>")
    .replace(NUMERIC_RE, "<n>")
    .slice(0, 240);
}

const MD2_RESERVED = new Set([
  "_", "*", "[", "]", "(", ")", "~", "`", ">", "#", "+", "-", "=", "|", "{", "}", ".", "!",
]);

function escapeMd2(input: string): string {
  let out = "";
  for (const ch of input) {
    if (MD2_RESERVED.has(ch)) out += `\\${ch}`;
    else out += ch;
  }
  return out;
}

const LEVEL_ICON: Record<LogLevel, string> = {
  info: "ℹ️",
  warn: "⚠️",
  error: "❌",
};

function formatMarkdownV2(entry: LogEntry): string {
  const ts = new Date(entry.ts).toISOString();
  const lines: string[] = [
    `${LEVEL_ICON[entry.level]} *[${entry.level}]* ${escapeMd2(entry.source)}`,
    escapeMd2(entry.message),
  ];
  if (entry.context) {
    const ctxStr = Object.entries(entry.context)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `  ${escapeMd2(k)}: ${escapeMd2(stringifyValue(v))}`)
      .join("\n");
    if (ctxStr) lines.push(`\`\`\`\n${ctxStr}\n\`\`\``);
  }
  lines.push(`_${escapeMd2(ts)}_`);
  return lines.join("\n\n");
}

function stringifyValue(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function logToConsole(
  level: LogLevel,
  source: string,
  message: string,
  context?: Record<string, unknown>,
): void {
  const ctxStr = context ? ` ${JSON.stringify(context)}` : "";
  const line = `[${level}] ${source}: ${message}${ctxStr}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

function readConfig(): AdminLoggerConfig | null {
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!chatId || chatId.trim() === "") return null;
  const burst = parsePositiveInt(process.env.TELEGRAM_LOG_BURST, DEFAULT_BURST);
  const refillMs = parsePositiveInt(process.env.TELEGRAM_LOG_RATE, DEFAULT_RATE_MS);
  const dedupMs = parsePositiveInt(process.env.TELEGRAM_LOG_DEDUP_MS, DEFAULT_DEDUP_MS);
  return { chatId, burst, refillMs, dedupMs };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

declare global {
  // eslint-disable-next-line no-var
  var __telegramAdminLogger: TelegramAdminLogger | undefined;
}

export function getAdminLogger(): TelegramAdminLogger {
  if (!globalThis.__telegramAdminLogger) {
    globalThis.__telegramAdminLogger = new TelegramAdminLogger(readConfig());
  }
  return globalThis.__telegramAdminLogger;
}

/** Test-only: reset the singleton between cases. */
export function resetAdminLoggerForTests(config: AdminLoggerConfig | null): TelegramAdminLogger {
  globalThis.__telegramAdminLogger = new TelegramAdminLogger(config);
  return globalThis.__telegramAdminLogger;
}
