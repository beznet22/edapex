import { randomBytes } from "node:crypto";
import { getDatabase } from "$lib/server/db";
import { sql } from "drizzle-orm";

interface ConnectTokenRow {
	parent_id: number;
	school_id: number;
	expires_at: string;
}

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
		const db = await getDatabase();
		const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

		await db.execute(
			sql`INSERT INTO connect_tokens (parent_id, token, expires_at, school_id) VALUES (${parentId}, ${token}, ${expiresAt}, ${schoolId})`,
		);

		return token;
	}

	private async fetchValidToken(token: string): Promise<ConnectTokenRow | null> {
		const db = await getDatabase();
		const result = (await db.execute(
			sql<ConnectTokenRow>`SELECT parent_id, school_id, expires_at FROM connect_tokens WHERE token = ${token} AND used_at IS NULL AND expires_at > NOW() LIMIT 1`,
		)) as unknown;

		if (Array.isArray(result)) {
			return (result[0] as ConnectTokenRow | undefined) ?? null;
		}
		const rows = (result as { rows?: ConnectTokenRow[] }).rows;
		return rows?.[0] ?? null;
	}

	async lookupToken(token: string): Promise<ConnectTokenLookup | null> {
		const row = await this.fetchValidToken(token);
		if (!row) return null;
		return {
			parentId: row.parent_id,
			schoolId: row.school_id,
			expiresAt: row.expires_at,
		};
	}

	async consumeToken(token: string): Promise<ConnectTokenResult | null> {
		const row = await this.fetchValidToken(token);
		if (!row) return null;

		const db = await getDatabase();
		await db.execute(
			sql`UPDATE connect_tokens SET used_at = NOW() WHERE token = ${token} AND used_at IS NULL`,
		);

		return {
			parentId: row.parent_id,
			schoolId: row.school_id,
		};
	}
}

export const connectTokenStore: ConnectTokenStore = ConnectTokenStore.getInstance();
