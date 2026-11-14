export class PreflightError extends Error {}

export interface LoadEvidence {
  readonly tableCount: number;
  readonly rows: number;
  readonly mismatches: number;
  readonly foreignKeyViolations: number;
  readonly sequences: number;
  readonly currentRecordIds: {
    readonly expected: number;
    readonly actual: number;
    readonly orphans: number;
  };
  readonly resolutions: {
    readonly expected: number;
    readonly actual: number;
  };
  readonly reconciliation: Readonly<
    Record<string, { readonly expected: number; readonly actual: number }>
  >;
}

export interface TransformManifest {
  readonly sourceSha256: string;
  readonly findings: Readonly<Record<string, number>>;
  readonly totals: {
    readonly sourceRows: number;
    readonly outputRows: number;
  };
  readonly tables: Readonly<
    Record<
      string,
      {
        readonly tier: number | null;
        readonly sourceRows: number;
        readonly outputRows: number;
      }
    >
  >;
}

export interface PhotoRow {
  readonly url: string;
  readonly file: string;
  readonly extension: string;
  readonly kind: string;
  readonly references: number;
  readonly students: number;
  readonly status: string;
  readonly path: string | null;
  readonly sha256: string | null;
  readonly bytes: number;
  readonly legacyHashLength?: number;
  readonly hashMatches?: boolean;
}

export interface PhotoInventory {
  readonly referenced: number;
  readonly images: number;
  readonly pdfs: number;
  readonly other: number;
  readonly missing: number;
  readonly rows: readonly PhotoRow[];
  readonly bytes: number;
}

export interface SqlFile {
  readonly name: string;
  readonly relativePath: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface BuildCutoverPlanInput {
  readonly source: string;
  readonly sourceSha256: string;
  readonly generatedAt: string;
  readonly loadEvidence: LoadEvidence;
  readonly manifest: TransformManifest;
  readonly photos: PhotoInventory;
  readonly sqlFiles: readonly SqlFile[];
}

export interface CutoverPlan {
  readonly schemaVersion: 1;
  readonly mode: "fresh-target";
  readonly executed: false;
  readonly status: "ready";
  readonly generatedAt: string;
  readonly source: string;
  readonly sourceSha256: string;
  readonly tables: number;
  readonly rows: number;
  readonly resolutions: number;
  readonly findings: Readonly<Record<string, number>>;
  readonly tableCounts: Readonly<
    Record<
      string,
      {
        readonly expected: number;
        readonly actual: number;
        readonly tier: number | null;
      }
    >
  >;
  readonly sqlFiles: readonly SqlFile[];
  readonly photos: {
    readonly referenced: number;
    readonly images: number;
    readonly missing: number;
    readonly uploadable: number;
    readonly bytes: number;
    readonly missingFiles: readonly { readonly file: string; readonly url: string }[];
  };
  readonly gates: Readonly<Record<string, boolean>>;
  readonly commands: {
    readonly migrations: string;
    readonly load: string;
    readonly verify: string;
    readonly photos: string;
  };
}

export function assertOutputUnderTmp(appRoot: string, out: string): string;
export function validateLoadEvidence(evidence: LoadEvidence): Record<string, boolean>;
export function buildCutoverPlan(input: BuildCutoverPlanInput): CutoverPlan;
export function shellQuote(value: string): string;
export function renderD1LoadScript(sqlFiles: readonly SqlFile[], appRoot: string): string;
export function renderD1VerifyScript(appRoot: string): string;
export function renderD1VerifyWrapper(planDir: string, appRoot: string): string;
export function renderPhotoUploadScript(rows: readonly PhotoRow[], appRoot: string): string;
export function renderMissingPhotosCsv(rows: readonly PhotoRow[]): string;
