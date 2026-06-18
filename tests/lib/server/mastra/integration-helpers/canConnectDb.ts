import mysql from "mysql2/promise";
import type { Connection } from "mysql2/promise";

const PROBE_TIMEOUT_MS = 3_000;
const PROBE_WARN = "DB unreachable for integration tests; skipping.";

function resolveDatabaseUrl(): string | undefined {
	const fromEnv = process.env["DATABASE_URL"];
	if (typeof fromEnv === "string" && fromEnv.length > 0) return fromEnv;
	try {
		const { env } = require("$env/dynamic/private") as { env: { DATABASE_URL?: unknown } };
		const fromSvelte = env.DATABASE_URL;
		if (typeof fromSvelte === "string" && fromSvelte.length > 0) return fromSvelte;
	} catch {
		// $env/dynamic/private is a SvelteKit virtual module — unavailable in
		// plain vitest. process.env fallback above is the canonical path.
	}
	return undefined;
}

let cachedResult: boolean | null = null;
let inflightProbe: Promise<boolean> | null = null;

const probe = async (): Promise<boolean> => {
	const url = resolveDatabaseUrl();
	if (typeof url !== "string" || url.length === 0) {
		console.warn(PROBE_WARN);
		return false;
	}

	let connection: Connection | null = null;
	try {
		connection = await mysql.createConnection({
			uri: url,
			connectTimeout: PROBE_TIMEOUT_MS,
		});

		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
		}, PROBE_TIMEOUT_MS);

		try {
			await connection.query("SELECT 1");
			return true;
		} catch (err) {
			if (!timedOut) console.warn(PROBE_WARN);
			return false;
		} finally {
			clearTimeout(timer);
		}
	} catch {
		console.warn(PROBE_WARN);
		return false;
	} finally {
		if (connection !== null) {
			try {
				await connection.end();
			} catch {
				// Connection may already be torn down; ignore.
			}
		}
	}
};

export async function canConnectDb(): Promise<boolean> {
	if (cachedResult !== null) return cachedResult;
	if (inflightProbe) return inflightProbe;

	inflightProbe = probe().finally(() => {
		inflightProbe = null;
	});

	cachedResult = await inflightProbe;
	return cachedResult;
}
