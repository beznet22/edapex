/**
 * Verified: Mastra @mastra/core@^1.32.1 supports instance-level storage configuration.
 * Agents within the supervisor hierarchy inherit storage automatically from the Mastra instance.
 * Uses native Mastra API: `new Mastra({ storage })` for centralized storage binding.
 */
import { Mastra } from '@mastra/core';
import { createMastraStorage } from './storage';

export type MastraInstanceConfig = {
	dbUrl?: string;
	agents?: Record<string, any>;
};

export type MastraInstanceResult = {
	mastra: Mastra;
	storage: ReturnType<typeof createMastraStorage>;
};

/**
 * Per-request Mastra factory — never cached, never shared.
 * Produces an isolated Mastra engine bound to its own LibSQLStore.
 * Called once per request inside event.locals to guarantee zero TenantContext leakage.
 *
 * All agents within the supervisor hierarchy inherit this storage automatically.
 * No agent should instantiate its own Memory({ storage: ... }) independently.
 *
 * @throws {MastraInitError} If storage initialization fails (connection refused, timeout, auth error)
 */
export function createMastraInstance(config: MastraInstanceConfig = {}): MastraInstanceResult {
	const dbUrl = config.dbUrl ?? undefined;

	let storage: ReturnType<typeof createMastraStorage>;
	try {
		storage = createMastraStorage(dbUrl);
	} catch (err) {
		throw new MastraInitError(
			`Failed to create Mastra storage adapter`,
			dbUrl ?? 'file:./mastra.db',
			classifyError(err)
		);
	}

	let mastra: Mastra;
	try {
		mastra = new Mastra({
			storage,
			agents: config.agents,
		});
	} catch (err) {
		throw new MastraInitError(
			`Failed to instantiate Mastra engine`,
			dbUrl ?? 'file:./mastra.db',
			classifyError(err)
		);
	}

	return { mastra, storage };
}

/**
 * Structured error thrown when Mastra instance initialization fails.
 * Includes connection details for debugging: storage URL and failure classification.
 */
export class MastraInitError extends Error {
	public readonly storageUrl: string;
	public readonly errorType: MastraInitErrorType;

	constructor(message: string, storageUrl: string, errorType: MastraInitErrorType) {
		super(`${message} [url=${storageUrl}, type=${errorType}]`);
		this.name = 'MastraInitError';
		this.storageUrl = storageUrl;
		this.errorType = errorType;
	}
}

export type MastraInitErrorType =
	| 'connection_refused'
	| 'timeout'
	| 'authentication_error'
	| 'unknown';

/**
 * Classifies an unknown error into a MastraInitErrorType for structured reporting.
 */
function classifyError(err: unknown): MastraInitErrorType {
	if (!(err instanceof Error)) return 'unknown';

	const message = err.message.toLowerCase();

	if (message.includes('timeout') || message.includes('timed out')) {
		return 'timeout';
	}
	if (
		message.includes('connection refused') ||
		message.includes('econnrefused') ||
		message.includes('connect failed')
	) {
		return 'connection_refused';
	}
	if (
		message.includes('auth') ||
		message.includes('unauthorized') ||
		message.includes('permission denied')
	) {
		return 'authentication_error';
	}

	return 'unknown';
}
