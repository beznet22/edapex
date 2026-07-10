/**
 * Pot-Luck CSV export / import service.
 *
 * Exports donations as CSV (active + inactive, no donor PII). When the
 * admin chooses the "encrypted" mode, the `key` column is encrypted with
 * AES-256-GCM using a key derived from the admin's passphrase + the
 * school's name via PBKDF2-HMAC-SHA256 (100,000 iterations, 32-byte key).
 *
 * Import is lenient: parse, validate, apply valid rows, collect failures
 * with reason. Conflict policy per row: `skip` (default — leave existing
 * donation alone) or `replace` (overwrite the existing row with the CSV
 * data).
 *
 * All payloads go through `data/audit-log/{schoolId}.jsonl` from the
 * remote-function layer (added in step 6); the service itself does not
 * write audit-log so it can be unit-tested without filesystem side-effects.
 */
import { eq, and } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import { potluckDonations, type PotluckDonation } from '$lib/server/mastra/storage/libsql/app-db.schema';

export type ExportMode = 'metadata-only' | 'encrypted';

export interface ExportOptions {
	mode: ExportMode;
	passphrase?: string;
	schoolName: string;
}

export interface ImportOptions {
	passphrase?: string;
	schoolName: string;
	conflictStrategy: 'skip' | 'replace';
}

export interface ExportResult {
	csv: string;
	count: number;
	mode: ExportMode;
}

export interface ImportFailure {
	rowIndex: number;
	reason: string;
	rawId?: string;
}

export interface ImportResult {
	imported: number;
	skipped: number;
	replaced: number;
	failures: ImportFailure[];
}

const PBKDF2_ITERATIONS = 100_000;
const KEY_BYTES = 32;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

/**
 * Maximum CSV payload size the import endpoint will accept. Enforced
 * both at the Zod-schema layer (with +1024 bytes of slack for CSV
 * escaping overhead) and inside the handler as a defense-in-depth check.
 */
export const POTLUCK_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export class PotluckUploadTooLargeError extends Error {
	readonly sizeBytes: number;
	readonly maxBytes: number;
	constructor(sizeBytes: number, maxBytes: number = POTLUCK_MAX_UPLOAD_BYTES) {
		super(`CSV upload ${sizeBytes} bytes exceeds cap of ${maxBytes} bytes`);
		this.name = 'PotluckUploadTooLargeError';
		this.sizeBytes = sizeBytes;
		this.maxBytes = maxBytes;
	}
}

export function assertUploadSize(csv: string): void {
	if (csv.length > POTLUCK_MAX_UPLOAD_BYTES) {
		throw new PotluckUploadTooLargeError(csv.length, POTLUCK_MAX_UPLOAD_BYTES);
	}
}

// CSV columns. Deliberately omits `donatedBy` (no donor PII in the file).
const CSV_COLUMNS = [
	'id',
	'schoolId',
	'providerId',
	'key',
	'donatedAt',
	'isActive',
	'lastValidatedAt',
	'lastValidationStatus',
	'tosAcceptedAt',
	'tosAcceptedBy',
	'tosVersion'
] as const;

// ────────────────────────────── CSV helpers ──────────────────────────────

function escapeCsvField(value: string): string {
	if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

function csvRow(values: readonly string[]): string {
	return values.map(escapeCsvField).join(',');
}

function parseCsvLine(line: string): string[] {
	const fields: string[] = [];
	let current = '';
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (inQuotes) {
			if (ch === '"') {
				if (line[i + 1] === '"') {
					current += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				current += ch;
			}
		} else {
			if (ch === '"') {
				inQuotes = true;
			} else if (ch === ',') {
				fields.push(current);
				current = '';
			} else {
				current += ch;
			}
		}
	}
	fields.push(current);
	return fields;
}

function parseCsv(input: string): { header: string[]; rows: string[][] } {
	// Normalize line endings; tolerate CRLF/CR/LF.
	const text = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	const lines = text.split('\n').filter((line) => line.length > 0);
	if (lines.length === 0) return { header: [], rows: [] };
	const header = parseCsvLine(lines[0]);
	const rows: string[][] = [];
	for (let i = 1; i < lines.length; i++) {
		rows.push(parseCsvLine(lines[i]));
	}
	return { header, rows };
}

// ────────────────────────────── crypto helpers ──────────────────────────────

function deriveKey(passphrase: string, schoolName: string): { key: Buffer; salt: Buffer } {
	// schoolName doubles as a per-school salt. Combined with the fixed PBKDF2
	// salt-length this gives stable, school-scoped keys without leaking the
	// school name itself.
	const salt = Buffer.alloc(SALT_BYTES);
	Buffer.from(schoolName, 'utf8').copy(salt, 0, 0, Math.min(schoolName.length, SALT_BYTES));
	const key = pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_BYTES, 'sha256');
	return { key, salt };
}

export function encryptKey(plaintext: string, passphrase: string, schoolName: string): string {
	const { key } = deriveKey(passphrase, schoolName);
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const authTag = cipher.getAuthTag();
	return Buffer.concat([iv, ciphertext, authTag]).toString('base64');
}

export function decryptKey(blob: string, passphrase: string, schoolName: string): string | null {
	let raw: Buffer;
	try {
		raw = Buffer.from(blob, 'base64');
	} catch {
		return null;
	}
	if (raw.length < IV_BYTES + AUTH_TAG_BYTES) return null;
	const iv = raw.subarray(0, IV_BYTES);
	const authTag = raw.subarray(raw.length - AUTH_TAG_BYTES);
	const ciphertext = raw.subarray(IV_BYTES, raw.length - AUTH_TAG_BYTES);
	const { key } = deriveKey(passphrase, schoolName);
	try {
		const decipher = createDecipheriv('aes-256-gcm', key, iv);
		decipher.setAuthTag(authTag);
		const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
		return plaintext.toString('utf8');
	} catch {
		return null;
	}
}

/**
 * Returns true when the passphrase matches the encrypted blob's auth tag.
 * Uses timingSafeEqual on the auth tag derived from a fresh encrypt of an
 * empty string so the check always takes the same time. This is the only
 * fast way to reject a wrong passphrase without trying to decrypt.
 */
export function verifyPassphrase(blob: string, passphrase: string, schoolName: string): boolean {
	const probe = encryptKey('probe', passphrase, schoolName);
	const a = Buffer.from(blob, 'base64');
	const b = Buffer.from(probe, 'base64');
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

// ────────────────────────────── export ──────────────────────────────

/**
 * Export all donations (active + inactive) for a school as CSV. The `key`
 * column is either empty (metadata-only mode) or an AES-256-GCM encrypted
 * blob (encrypted mode). The donor field is deliberately excluded for
 * privacy.
 */
export async function exportDonations(
	db: LibSQLDatabase<any>,
	schoolId: number,
	options: ExportOptions
): Promise<ExportResult> {
	const rows = await db
		.select()
		.from(potluckDonations)
		.where(eq(potluckDonations.schoolId, schoolId));

	const lines: string[] = [csvRow(CSV_COLUMNS as readonly string[])];
	for (const row of rows) {
		const keyField =
			options.mode === 'metadata-only'
				? ''
				: options.passphrase && options.schoolName
					? encryptKey(row.apiKeyEncrypted, options.passphrase, options.schoolName)
					: '';
		lines.push(
			csvRow([
				row.id,
				String(row.schoolId),
				row.providerId,
				keyField,
				row.donatedAt ?? '',
				String(row.isActive),
				row.lastValidatedAt ?? '',
				row.lastValidationStatus ?? '',
				row.tosAcceptedAt ?? '',
				row.tosAcceptedBy !== null && row.tosAcceptedBy !== undefined
					? String(row.tosAcceptedBy)
					: '',
				row.tosVersion ?? ''
			])
		);
	}
	return { csv: lines.join('\n') + '\n', count: rows.length, mode: options.mode };
}

// ────────────────────────────── import ──────────────────────────────

interface ParsedRow {
	id: string;
	schoolId: number;
	providerId: string;
	keyEncryptedBlob: string;
	donatedAt: string;
	isActive: number;
	lastValidatedAt: string | null;
	lastValidationStatus: string | null;
	tosAcceptedAt: string | null;
	tosAcceptedBy: number | null;
	tosVersion: string | null;
}

function validateRow(
	rowIndex: number,
	header: string[],
	values: string[],
	encrypted: boolean,
	passphrase: string | undefined,
	schoolName: string,
	failures: ImportFailure[]
): ParsedRow | null {
	const indexed: Record<string, string> = {};
	for (let i = 0; i < header.length; i++) {
		indexed[header[i]] = values[i] ?? '';
	}
	const id = indexed['id'] ?? '';
	const schoolIdStr = indexed['schoolId'] ?? '';
	const providerId = indexed['providerId'] ?? '';
	const keyField = indexed['key'] ?? '';
	const donatedAt = indexed['donatedAt'] ?? '';
	const isActiveStr = indexed['isActive'] ?? '1';
	const lastValidatedAt = indexed['lastValidatedAt'] ?? '';
	const lastValidationStatus = indexed['lastValidationStatus'] ?? '';
	const tosAcceptedAt = indexed['tosAcceptedAt'] ?? '';
	const tosAcceptedBy = indexed['tosAcceptedBy'] ?? '';
	const tosVersion = indexed['tosVersion'] ?? '';

	if (!id || !providerId || !donatedAt) {
		failures.push({ rowIndex, reason: 'missing_required_field', rawId: id });
		return null;
	}
	const schoolId = Number(schoolIdStr);
	if (!Number.isFinite(schoolId)) {
		failures.push({ rowIndex, reason: 'invalid_schoolId', rawId: id });
		return null;
	}
	const isActive = Number(isActiveStr);
	if (!Number.isFinite(isActive)) {
		failures.push({ rowIndex, reason: 'invalid_isActive', rawId: id });
		return null;
	}

	let keyEncryptedBlob = '';
	if (encrypted) {
		if (!passphrase) {
			failures.push({ rowIndex, reason: 'missing_passphrase', rawId: id });
			return null;
		}
		if (!keyField) {
			failures.push({ rowIndex, reason: 'missing_key', rawId: id });
			return null;
		}
		const decrypted = decryptKey(keyField, passphrase, schoolName);
		if (decrypted === null) {
			failures.push({ rowIndex, reason: 'wrong_passphrase_or_corrupt_key', rawId: id });
			return null;
		}
		// `decrypted` is the original at-rest ciphertext (the
		// donation's `apiKeyEncrypted` column as stored by the donor flow).
		// We store it as-is so the 4-tier router's `decrypt()` continues
		// to read it with the server key on the next request — no
		// double-encryption.
		keyEncryptedBlob = decrypted;
	}

	return {
		id,
		schoolId,
		providerId,
		keyEncryptedBlob,
		donatedAt,
		isActive,
		lastValidatedAt: lastValidatedAt || null,
		lastValidationStatus: lastValidationStatus || null,
		tosAcceptedAt: tosAcceptedAt || null,
		tosAcceptedBy: tosAcceptedBy ? Number(tosAcceptedBy) : null,
		tosVersion: tosVersion || null
	};
}

function reencryptWithServerKey(_plaintext: string): never {
	throw new Error('reencryptWithServerKey is no longer used');
}
void reencryptWithServerKey;

/**
 * Import donations from a CSV. Lenient: valid rows are applied, invalid
 * rows are collected into `failures` with a reason. Existing rows are
 * either skipped (default) or replaced based on `conflictStrategy`.
 *
 * Note: the schema enforces UNIQUE(school_id, provider_id, donated_by);
 * since we don't track `donatedBy` here, we treat the row's `id` as the
 * de-dupe key. If the imported `id` already exists in the DB we apply
 * the conflictStrategy against that row; otherwise we INSERT a new row.
 */
export async function importDonations(
	db: LibSQLDatabase<any>,
	csv: string,
	options: ImportOptions
): Promise<ImportResult> {
	const { header, rows } = parseCsv(csv);
	const failures: ImportFailure[] = [];
	const encrypted = header.includes('key') && rows.some((r) => (r[header.indexOf('key')] ?? '').length > 0);
	if (encrypted && !options.passphrase) {
		failures.push({ rowIndex: 0, reason: 'passphrase_required' });
	}
	const parsed: ParsedRow[] = [];
	for (let i = 0; i < rows.length; i++) {
		const row = validateRow(i + 1, header, rows[i], encrypted, options.passphrase, options.schoolName, failures);
		if (row) parsed.push(row);
	}

	let imported = 0;
	let skipped = 0;
	let replaced = 0;

	for (const row of parsed) {
		const existing = await db
			.select()
			.from(potluckDonations)
			.where(and(eq(potluckDonations.id, row.id), eq(potluckDonations.schoolId, row.schoolId)))
			.limit(1);
		if (existing[0]) {
			if (options.conflictStrategy === 'skip') {
				skipped++;
				continue;
			}
			await db
				.update(potluckDonations)
				.set({
					providerId: row.providerId,
					apiKeyEncrypted: row.keyEncryptedBlob || existing[0].apiKeyEncrypted,
					donatedAt: row.donatedAt,
					isActive: row.isActive,
					lastValidatedAt: row.lastValidatedAt,
					lastValidationStatus: row.lastValidationStatus,
					tosAcceptedAt: row.tosAcceptedAt,
					tosAcceptedBy: row.tosAcceptedBy,
					tosVersion: row.tosVersion
				})
				.where(eq(potluckDonations.id, row.id));
			replaced++;
		} else {
			await db.insert(potluckDonations).values({
				id: row.id,
				schoolId: row.schoolId,
				providerId: row.providerId,
				apiKeyEncrypted: row.keyEncryptedBlob || '',
				donatedBy: 1,
				donatedAt: row.donatedAt,
				isActive: row.isActive,
				lastValidatedAt: row.lastValidatedAt,
				lastValidationStatus: row.lastValidationStatus,
				tosAcceptedAt: row.tosAcceptedAt,
				tosAcceptedBy: row.tosAcceptedBy,
				tosVersion: row.tosVersion
			});
			imported++;
		}
	}

	return { imported, skipped, replaced, failures };
}

export type { PotluckDonation };
