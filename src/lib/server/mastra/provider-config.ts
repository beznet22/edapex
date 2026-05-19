import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { eq, and, sql } from 'drizzle-orm';
import { providerCredentials, type ProviderCredential } from './db/schema';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './db/schema';

const ALGORITHM = 'aes-256-cbc';

export interface ProviderState extends ProviderCredential {
	source: 'db' | 'env';
	apiKeyMasked: string;
}

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
	try {
		const [ivHex, encrypted] = encryptedText.split(':');
		if (!ivHex || !encrypted) return '';
		
		const iv = Buffer.from(ivHex, 'hex');
		const decipher = createDecipheriv(ALGORITHM, getKeyBuffer(encryptionKey), iv);
		let decrypted = decipher.update(encrypted, 'hex', 'utf8');
		decrypted += decipher.final('utf8');
		return decrypted;
	} catch (e) {
		console.error('Failed to decrypt provider key:', e);
		return '';
	}
}

export function maskKey(key: string): string {
	if (!key) return '';
	if (key.length <= 8) return '********';
	return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

/**
 * Normalizes request options for the EdApexGateway / Opengateway.
 * Strips provider-specific headers and ensures OpenAI-compatible transport.
 */
export function normalizeGatewayRequest(provider: string, options: any): any {
	const normalized = { ...options };
	
	if (provider === 'opengateway') {
		// Strip all x-provider-* headers to avoid leaking internal routing logic
		if (normalized.headers) {
			const headers = { ...normalized.headers };
			Object.keys(headers).forEach(key => {
				if (key.toLowerCase().startsWith('x-provider-')) {
					delete headers[key];
				}
			});
			normalized.headers = headers;
		} else {
			normalized.headers = {};
		}

		// Ensure base URL ends with /v1 if it's an OpenAI-compatible gateway
		if (normalized.baseURL && !normalized.baseURL.endsWith('/v1')) {
			normalized.baseURL = normalized.baseURL.replace(/\/+$/, '') + '/v1';
		}

		// Map max_tokens to max_completion_tokens for OpenGateway compatibility
		if (normalized.max_tokens !== undefined) {
			normalized.max_completion_tokens = normalized.max_tokens;
			delete normalized.max_tokens;
		}
	}

	if (provider === 'opencode') {
		// OpenCode Zen — OpenAI-compatible endpoint with API key auth
		if (!normalized.baseURL) {
			normalized.baseURL = 'https://opencode.ai/zen/v1';
		}

		// Map max_tokens to max_completion_tokens
		if (normalized.max_tokens !== undefined) {
			normalized.max_completion_tokens = normalized.max_tokens;
			delete normalized.max_tokens;
		}

		// Ensure headers include api-key (OpenCode validates it)
		if (!normalized.headers) {
			normalized.headers = {};
		}
		if (normalized.apiKey) {
			normalized.headers['api-key'] = normalized.apiKey;
		}
	}

	return normalized;
}

// ─── Migration ──────────────────────────────────────────────────────────────

/**
 * Ensures that all AI sovereign storage tables exist and are up-to-date in the libSQL database.
 */
export async function ensureAgentTables(db: LibSQLDatabase<typeof schema>): Promise<void> {
	// 1. Provider Credentials
	await db.run(sql`
		CREATE TABLE IF NOT EXISTS provider_credentials (
			id TEXT PRIMARY KEY,
			user_id INTEGER NOT NULL,
			provider TEXT NOT NULL,
			api_key_encrypted TEXT,
			base_url TEXT NOT NULL DEFAULT '',
			enabled INTEGER NOT NULL DEFAULT 1,
			updated_at TEXT NOT NULL DEFAULT (datetime('now')),
			UNIQUE(user_id, provider)
		)
	`);

	// Migration: Add priority to provider_credentials
	try {
		await db.run(sql`ALTER TABLE provider_credentials ADD COLUMN priority INTEGER NOT NULL DEFAULT 1`);
	} catch (e) {
		// Column likely already exists
	}

	// 2. Agent Routing
	await db.run(sql`
		CREATE TABLE IF NOT EXISTS agent_routing (
			id TEXT PRIMARY KEY,
			user_id INTEGER NOT NULL,
			role TEXT NOT NULL,
			provider TEXT NOT NULL,
			model TEXT NOT NULL,
			updated_at TEXT NOT NULL DEFAULT (datetime('now')),
			UNIQUE(user_id, role)
		)
	`);

	// Migration: Rename persona to role in agent_routing
	try {
		await db.run(sql`ALTER TABLE agent_routing RENAME COLUMN persona TO role`);
	} catch (e) {
		// Column likely already renamed or table was just created with 'role'
	}

	// 3. Agent Settings
	await db.run(sql`
		CREATE TABLE IF NOT EXISTS agent_settings (
			user_id INTEGER PRIMARY KEY,
			profile TEXT NOT NULL DEFAULT 'balanced',
			global_tools_enabled INTEGER NOT NULL DEFAULT 1,
			updated_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`);
}

// ─── Provider Credential CRUD ───────────────────────────────────────────────

export async function saveProviderCredential(
	db: LibSQLDatabase<typeof schema>,
	config: Omit<ProviderCredential, 'id' | 'updatedAt'>
): Promise<void> {
	await ensureAgentTables(db);
	await db
		.insert(providerCredentials)
		.values({
			...config,
			updatedAt: new Date().toISOString()
		})
		.onConflictDoUpdate({
			target: [providerCredentials.userId, providerCredentials.provider],
			set: {
				apiKeyEncrypted: config.apiKeyEncrypted,
				baseUrl: config.baseUrl,
				priority: config.priority,
				enabled: config.enabled,
				updatedAt: new Date().toISOString()
			}
		});
}

export async function getProviderCredentialWithFallback(
	db: LibSQLDatabase<typeof schema>,
	userId: number,
	provider: string,
	envKeys: Record<string, string | undefined>
): Promise<ProviderState | null> {
	await ensureAgentTables(db);
	
	const [dbConfig] = await db
		.select()
		.from(providerCredentials)
		.where(and(eq(providerCredentials.userId, userId), eq(providerCredentials.provider, provider)))
		.limit(1);

	if (dbConfig) {
		return {
			...dbConfig,
			source: 'db',
			apiKeyMasked: dbConfig.apiKeyEncrypted ? '********' : (provider === 'opengateway' ? 'keyless' : '')
		};
	}

	const envKey = envKeys[`${provider.toUpperCase()}_API_KEY`];
	if (!envKey && provider !== 'opengateway') return null;

	return {
		id: `env-${provider}`,
		provider,
		userId,
		apiKeyEncrypted: '',
		baseUrl: envKeys[`${provider.toUpperCase()}_BASE_URL`] || '',
		priority: 1,
		enabled: 1,
		updatedAt: new Date().toISOString(),
		source: 'env',
		apiKeyMasked: envKey ? maskKey(envKey) : (provider === 'opengateway' ? 'keyless' : '')
	};
}

export async function getAllActiveProviders(
	db: LibSQLDatabase<typeof schema>,
	userId: number,
	envKeys: Record<string, string | undefined>,
	supportedProviders: string[]
): Promise<ProviderState[]> {
	await ensureAgentTables(db);
	const dbConfigs = await db
		.select()
		.from(providerCredentials)
		.where(eq(providerCredentials.userId, userId));

	const results: ProviderState[] = [];
	const seenProviders = new Set<string>();

	for (const config of dbConfigs) {
		if (supportedProviders.includes(config.provider)) {
			results.push({
				...config,
				source: 'db',
				apiKeyMasked: config.apiKeyEncrypted ? '********' : ''
			});
			seenProviders.add(config.provider);
		}
	}

	for (const provider of supportedProviders) {
		if (!seenProviders.has(provider)) {
			const fallback = await getProviderCredentialWithFallback(db, userId, provider, envKeys);
			if (fallback) {
				results.push(fallback);
			}
		}
	}

	// Always ensure opengateway appears (keyless, always available)
	if (!seenProviders.has('opengateway') && !results.find(r => r.provider === 'opengateway')) {
		results.push({
			id: 'env-opengateway',
			provider: 'opengateway',
			userId,
			apiKeyEncrypted: '',
			baseUrl: envKeys['OPENGATEWAY_BASE_URL'] || 'https://opengateway.gitlawb.com/v1',
			priority: 0,
			enabled: 1,
			updatedAt: new Date().toISOString(),
			source: 'env',
			apiKeyMasked: 'keyless'
		});
	}

	return results;
}

export async function deleteProviderCredential(
	db: LibSQLDatabase<typeof schema>,
	userId: number,
	provider: string
): Promise<void> {
	await ensureAgentTables(db);
	await db
		.delete(providerCredentials)
		.where(and(eq(providerCredentials.userId, userId), eq(providerCredentials.provider, provider)));
}

/**
 * Returns the list of provider keys a user has configured (DB or env).
 * Each entry includes the provider ID, masked key name, enabled status, and source.
 */
export async function getUserProviderKeys(
	db: LibSQLDatabase<typeof schema>,
	userId: number,
	envKeys: Record<string, string | undefined>,
	supportedProviders: string[]
): Promise<Array<{ provider: string; name: string; enabled: boolean; source: 'db' | 'env' }>> {
	const providers = await getAllActiveProviders(db, userId, envKeys, supportedProviders);

	return providers.map(p => ({
		provider: p.provider,
		name: p.apiKeyMasked,
		enabled: p.enabled === 1,
		source: p.source,
	}));
}

export const saveProviderConfig = saveProviderCredential;
export const deleteProviderConfig = deleteProviderCredential;
