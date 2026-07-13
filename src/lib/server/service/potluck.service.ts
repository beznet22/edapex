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
 * Donations now live in the unified `encrypted_credentials` table with
 * `scope = 'school'` and `credential_kind = 'donation'`. The donor metadata
 * (donatedBy, tos info, etc.) is encrypted inside `encrypted_data` so the
 * export path needs `env` to decrypt and re-encrypt for the CSV.
 */
import { eq, and } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import {
	encryptedCredentials,
	type EncryptedCredential
} from '$lib/server/mastra/storage/libsql/app-db.schema';
import { decrypt as decryptText, encrypt as encryptText, getEncryptionKey } from '$lib/server/mastra/provider/crypto';
import type { ProviderId } from '$lib/server/mastra/provider/types';

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

export function verifyPassphrase(blob: string, passphrase: string, schoolName: string): boolean {
	const probe = encryptKey('probe', passphrase, schoolName);
	const a = Buffer.from(blob, 'base64');
	const b = Buffer.from(probe, 'base64');
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

// ────────────────────────────── donation payload helpers ──────────────────────────────

interface DonationPayload {
	apiKey: string;
	donatedBy: number;
	donatedAt: string;
	tosAcceptedAt: string | null;
	tosAcceptedBy: number | null;
	tosVersion: string | null;
}

function decodePayload(encryptedData: string, env: Record<string, string | undefined>): DonationPayload {
	const decrypted = decryptText(encryptedData, getEncryptionKey(env));
	return JSON.parse(decrypted) as DonationPayload;
}

function encodePayload(payload: DonationPayload, env: Record<string, string | undefined>): string {
	return encryptText(JSON.stringify(payload), getEncryptionKey(env));
}

function rowToDonation(
	row: EncryptedCredential,
	env: Record<string, string | undefined>
): {
	id: string;
	schoolId: number;
	providerId: string;
	apiKeyEncrypted: string;
	donatedBy: number;
	donatedAt: string;
	isActive: number;
	lastValidatedAt: string | null;
	lastValidationStatus: string | null;
	tosAcceptedAt: string | null;
	tosAcceptedBy: number | null;
	tosVersion: string | null;
} {
	const payload = decodePayload(row.encryptedData, env);
	return {
		id: row.id,
		schoolId: row.schoolId ?? 0,
		providerId: row.providerId,
		apiKeyEncrypted: row.encryptedData,
		donatedBy: payload.donatedBy,
		donatedAt: payload.donatedAt,
		isActive: row.enabled,
		lastValidatedAt: null,
		lastValidationStatus: null,
		tosAcceptedAt: payload.tosAcceptedAt,
		tosAcceptedBy: payload.tosAcceptedBy,
		tosVersion: payload.tosVersion
	};
}

// ────────────────────────────── export ──────────────────────────────

export async function exportDonations(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	schoolId: number,
	options: ExportOptions
): Promise<ExportResult> {
	const rows = await db
		.select()
		.from(encryptedCredentials)
		.where(
			and(
				eq(encryptedCredentials.scope, 'school'),
				eq(encryptedCredentials.credentialKind, 'donation'),
				eq(encryptedCredentials.schoolId, schoolId)
			)
		);

	const lines: string[] = [csvRow(CSV_COLUMNS as readonly string[])];
	for (const row of rows) {
		const donation = rowToDonation(row, env);
		const keyField =
			options.mode === 'metadata-only'
				? ''
				: options.passphrase && options.schoolName
					? encryptKey(donation.apiKeyEncrypted, options.passphrase, options.schoolName)
					: '';
		lines.push(
			csvRow([
				donation.id,
				String(donation.schoolId),
				donation.providerId,
				keyField,
				donation.donatedAt ?? '',
				String(donation.isActive),
				donation.lastValidatedAt ?? '',
				donation.lastValidationStatus ?? '',
				donation.tosAcceptedAt ?? '',
				donation.tosAcceptedBy !== null && donation.tosAcceptedBy !== undefined
					? String(donation.tosAcceptedBy)
					: '',
				donation.tosVersion ?? ''
			])
		);
	}
	return { csv: lines.join('\n') + '\n', count: rows.length, mode: options.mode };
}

// ────────────────────────────── import ──────────────────────────────

interface ParsedRow {
	id: string;
	schoolId: number;
	providerId: ProviderId;
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
		keyEncryptedBlob = decrypted;
	}

	return {
		id,
		schoolId,
		providerId: providerId as ProviderId,
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

export async function importDonations(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	csv: string,
	options: ImportOptions
): Promise<ImportResult> {
	const { header, rows } = parseCsv(csv);
	const failures: ImportFailure[] = [];
	const encrypted =
		header.includes('key') && rows.some((r) => (r[header.indexOf('key')] ?? '').length > 0);
	if (encrypted && !options.passphrase) {
		failures.push({ rowIndex: 0, reason: 'passphrase_required' });
	}
	const parsed: ParsedRow[] = [];
	for (let i = 0; i < rows.length; i++) {
		const row = validateRow(
			i + 1,
			header,
			rows[i],
			encrypted,
			options.passphrase,
			options.schoolName,
			failures
		);
		if (row) parsed.push(row);
	}

	let imported = 0;
	let skipped = 0;
	let replaced = 0;

	for (const row of parsed) {
		const existing = await db
			.select()
			.from(encryptedCredentials)
			.where(
				and(
					eq(encryptedCredentials.id, row.id),
					eq(encryptedCredentials.scope, 'school'),
					eq(encryptedCredentials.credentialKind, 'donation')
				)
			)
			.limit(1);

		const now = new Date().toISOString();
		const payload: DonationPayload = {
			apiKey: row.keyEncryptedBlob,
			donatedBy: 1,
			donatedAt: row.donatedAt,
			tosAcceptedAt: row.tosAcceptedAt,
			tosAcceptedBy: row.tosAcceptedBy,
			tosVersion: row.tosVersion
		};
		const encryptedData =
			row.keyEncryptedBlob || existing[0]
				? encodePayload(
						row.keyEncryptedBlob
							? payload
							: decodePayload(existing[0].encryptedData, env),
						env
				  )
				: '';

		if (existing[0]) {
			if (options.conflictStrategy === 'skip') {
				skipped++;
				continue;
			}
			await db
				.update(encryptedCredentials)
				.set({
					providerId: row.providerId,
					encryptedData,
					enabled: row.isActive,
					updatedAt: now
				})
				.where(eq(encryptedCredentials.id, row.id));
			replaced++;
		} else {
			await db.insert(encryptedCredentials).values({
				id: row.id,
				scope: 'school',
				credentialKind: 'donation',
				userId: null,
				schoolId: row.schoolId,
				providerId: row.providerId,
				encryptedData,
				priority: 1,
				enabled: row.isActive
			});
			imported++;
		}
	}

	return { imported, skipped, replaced, failures };
}
