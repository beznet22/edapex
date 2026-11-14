export type LogFields = Readonly<Record<string, string | number | boolean | null>>;

export interface Logger {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

export const consoleLogger: Logger = {
  info(event, fields) {
    console.info(event, fields ?? {});
  },
  warn(event, fields) {
    console.warn(event, fields ?? {});
  },
  error(event, fields) {
    console.error(event, fields ?? {});
  }
};
