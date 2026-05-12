import { Mastra } from '@mastra/core';
import { createMastraStorage } from './storage';

export type MastraInstanceConfig = {
	dbUrl?: string;
};

/**
 * Per-request Mastra factory — never cached, never shared.
 * Produces an isolated Mastra engine bound to its own LibSQLStore.
 * Called once per request inside event.locals to guarantee zero TenantContext leakage.
 */
export function createMastraInstance(config: MastraInstanceConfig = {}): {
	mastra: Mastra;
	storage: ReturnType<typeof createMastraStorage>;
} {
	const storage = createMastraStorage(config.dbUrl);

	const mastra = new Mastra({
		storage
	});

	return { mastra, storage };
}
