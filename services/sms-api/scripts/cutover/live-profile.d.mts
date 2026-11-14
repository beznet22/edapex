export const HISTORICAL_RAW_TABLES: readonly string[];
export const HISTORICAL_CONFIG_TABLES: readonly string[];
export const NON_LIVE_TABLES: readonly string[];
export const REQUIRED_LIVE_TABLES: readonly string[];
export const ARCHIVE_METADATA_TABLES: readonly string[];

export interface ForeignKeyRef {
  readonly column: string;
  readonly refTable: string;
  readonly refColumn: string;
}

export function computeLiveTables(
  allTables: readonly string[],
  foreignKeys: ReadonlyMap<string, readonly ForeignKeyRef[]>
): readonly string[];

export function profileTables(
  allTables: readonly string[],
  foreignKeys: ReadonlyMap<string, readonly ForeignKeyRef[]>
): {
  readonly live: readonly string[];
  readonly excluded: readonly string[];
  readonly archiveMetadata: readonly string[];
};
