import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { createClient, type Client } from '@libsql/client';

const ALGORITHM = 'aes-256-cbc';

/**
 * Row shape for the `provider_configs` table in libSQL (mastra.db).
 * Replaces the legacy MySQL `personal_access_tokens` storage.
 */
export interface ProviderConfigRow {
	id: string; // 'cerebras' | 'groq' | 'nvidia' | 'mistral'
	apiKeyEncrypted: string;
	priority: number; // 1 = highest
	baseUrl: string;
	taskMappings: string; // JSON: { ocr?: string, chat?: string, vision?: string, title?: string }
	enabled: boolean;
	updatedAt: string; // ISO 8601
}

export type TaskMappings = {
	ocr?: string;
	chat?: string;
	vision?: string;
	title?: string;
};

// ─── Encryption ──────────────────────────────────────────────────────────────

function getKeyBuffer(encryptionKey: string): Buffer {
	return createHash('sha256').update(encryptionKey).digest();
}

export function encrypt(text: string, encryptionKey: string): string {
	const iv = randomBytes(16);
	const cipher = createCipheriv(ALGORITHM, getKeyBuffer(encryptionKey), iv);
	let encrypted = cipher.update(text, 'utf8', 'hex');
	encrypted += cipher.final('hex');
	return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(encryptedText: string, encryptionKey: string): string {
	const [ivHex, encrypted] = encryptedText.split(':');
	const iv = Buffer.from(ivHex, 'hex');
	const decipher = createDecipheriv(ALGORITHM, getKeyBuffer(encryptionKey), iv);
	let decrypted = decipher.update(encrypted, 'hex', 'utf8');
	decrypted += decipher.final('utf8');
	return decrypted;
}

// ─── Table Bootstrap ─────────────────────────────────────────────────────────

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS provider_configs (
  id TEXT PRIMARY KEY,
  api_key_encrypted TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 99,
  base_url TEXT NOT NULL DEFAULT '',
  task_mappings TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

export async function ensureProviderConfigTable(client: Client): Promise<void> {
	await client.execute(CREATE_TABLE_SQL);
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function saveProviderConfig(
	client: Client,
	config: ProviderConfigRow
): Promise<void> {
	await client.execute({
		sql: `INSERT OR REPLACE INTO provider_configs
			(id, api_key_encrypted, priority, base_url, task_mappings, enabled, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)`,
		args: [
			config.id,
			config.apiKeyEncrypted,
			config.priority,
			config.baseUrl,
			config.taskMappings,
			config.enabled ? 1 : 0,
			config.updatedAt
		]
	});
}

export async function getProviderConfig(
	client: Client,
	providerId: string
): Promise<ProviderConfigRow | null> {
	const result = await client.execute({
		sql: 'SELECT * FROM provider_configs WHERE id = ?',
		args: [providerId]
	});

	if (result.rows.length === 0) return null;
	return rowToConfig(result.rows[0]);
}

export async function getAllProviderConfigs(
	client: Client
): Promise<ProviderConfigRow[]> {
	const result = await client.execute(
		'SELECT * FROM provider_configs WHERE enabled = 1 ORDER BY priority ASC'
	);

	return result.rows.map(rowToConfig);
}

export async function deleteProviderConfig(
	client: Client,
	providerId: string
): Promise<boolean> {
	const result = await client.execute({
		sql: 'DELETE FROM provider_configs WHERE id = ?',
		args: [providerId]
	});

	return (result.rowsAffected ?? 0) > 0;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rowToConfig(row: Record<string, unknown>): ProviderConfigRow {
	return {
		id: row.id as string,
		apiKeyEncrypted: row.api_key_encrypted as string,
		priority: row.priority as number,
		baseUrl: row.base_url as string,
		taskMappings: row.task_mappings as string,
		enabled: (row.enabled as number) === 1,
		updatedAt: row.updated_at as string
	};
}
