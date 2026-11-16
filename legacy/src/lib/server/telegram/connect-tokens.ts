import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { getAppDb } from "$lib/server/mastra/storage/libsql/app-db";
import { connectTokens } from "$lib/server/mastra/storage/libsql/app-db.schema";
import { getAdminLogger } from "./admin-logger";

interface ConnectTokenResult {
	parentId: number;
	schoolId: number;
}

interface ConnectTokenLookup {
	parentId: number;
	schoolId: number;
	expiresAt: string;
}

export class ConnectTokenStore {
	private static _instance: ConnectTokenStore | null = null;

	private constructor() {}

	static getInstance(): ConnectTokenStore {
		if (!ConnectTokenStore._instance) {
			ConnectTokenStore._instance = new ConnectTokenStore();
		}
		return ConnectTokenStore._instance;
	}

	async createToken(
		parentId: number,
		schoolId: number,
		ttlHours: number = 24,
	): Promise<string> {
		const token = randomBytes(32).toString("hex");
		const db = getAppDb();
		const expiresAt = new Date(
			Date.now() + ttlHours * 60 * 60 * 1000,
		).toISOString();

		db.insert(connectTokens).values({
			parentId,
			token,
			expiresAt,
			schoolId,
		}).run();

		return token;
	}

	private async fetchValidToken(token: string) {
		const db = getAppDb();
		const row = await db
			.select({
				parentId: connectTokens.parentId,
				schoolId: connectTokens.schoolId,
				expiresAt: connectTokens.expiresAt,
			})
			.from(connectTokens)
			.where(
				and(
					eq(connectTokens.token, token),
					isNull(connectTokens.usedAt),
					gt(connectTokens.expiresAt, sql`(datetime('now'))`),
				),
			)
			.limit(1)
			.get();

		return row ?? null;
	}

	async lookupToken(token: string): Promise<ConnectTokenLookup | null> {
		const row = await this.fetchValidToken(token);
		if (!row) return null;
		return {
			parentId: row.parentId,
			schoolId: row.schoolId,
			expiresAt: row.expiresAt,
		};
	}

	/**
	 * Atomically consume a connect token. Rejects on:
	 *   - missing / expired / already-used
	 *   - schoolId mismatch (cross-school replay)
	 *
	 * `expectedSchoolId` defaults to 1 because the deployment is
	 * single-school for now. Multi-school support will pass the link's
	 * schoolId through from the gateway.
	 */
	async consumeToken(
		token: string,
		expectedSchoolId: number = 1,
	): Promise<ConnectTokenResult | null> {
		const row = await this.fetchValidToken(token);
		if (!row) return null;
		if (row.schoolId !== expectedSchoolId) {
			await getAdminLogger().warn(
				"connect-tokens",
				"cross-school replay rejected",
				{
					tokenPrefix: token.slice(0, 8),
					tokenSchoolId: row.schoolId,
					expectedSchoolId,
				},
			);
			return null;
		}
		const db = getAppDb();
		db.update(connectTokens)
			.set({ usedAt: sql`(datetime('now'))` })
			.where(and(eq(connectTokens.token, token), isNull(connectTokens.usedAt)))
			.run();

		return {
			parentId: row.parentId,
			schoolId: row.schoolId,
		};
	}
}

export const connectTokenStore: ConnectTokenStore =
	ConnectTokenStore.getInstance();
