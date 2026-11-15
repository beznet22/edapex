/**
 * In-memory ring buffer of recent log entries.
 *
 * Used by `TelegramAdminLogger` to:
 *   1. Surface the last N events to the `/logs` admin command.
 *   2. Avoid losing the very first few events on a cold start
 *      (Telegram adapter may not be ready yet).
 *
 * Pure data structure, no I/O, fully synchronous. HMR-safe via a
 * module-level singleton.
 */
export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  /** Unix epoch milliseconds. */
  ts: number;
  level: LogLevel;
  source: string;
  message: string;
  context?: Record<string, unknown>;
}

const DEFAULT_CAPACITY = 200;

class LogBuffer {
  private entries: LogEntry[] = [];
  private readonly capacity: number;

  constructor(capacity: number = DEFAULT_CAPACITY) {
    this.capacity = capacity;
  }

  push(entry: LogEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.capacity) {
      this.entries.shift();
    }
  }

  snapshot(): readonly LogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }

  size(): number {
    return this.entries.length;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __telegramLogBuffer: LogBuffer | undefined;
}

export function getLogBuffer(): LogBuffer {
  if (!globalThis.__telegramLogBuffer) {
    globalThis.__telegramLogBuffer = new LogBuffer();
  }
  return globalThis.__telegramLogBuffer;
}

/** Test-only: reset the singleton between cases. */
export function resetLogBufferForTests(): void {
  globalThis.__telegramLogBuffer = new LogBuffer();
}
