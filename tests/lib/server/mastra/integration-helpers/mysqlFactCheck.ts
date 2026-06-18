import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const TIMEOUT_MS = 5_000;
const MAX_BUFFER_BYTES = 16 * 1024 * 1024;

interface MysqlConn {
	readonly host: string;
	readonly port: string;
	readonly user: string;
	readonly password: string;
	readonly database: string;
}

let cachedConn: MysqlConn | null = null;

function loadEnvVar(name: string): string {
	const content = readFileSync('.env', 'utf8');
	for (const rawLine of content.split('\n')) {
		const line = rawLine.trim();
		if (line.length === 0 || line.startsWith('#')) continue;
		const eq = line.indexOf('=');
		if (eq === -1) continue;
		const key = line.slice(0, eq).trim();
		if (key !== name) continue;
		let value = line.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		return value;
	}
	throw new Error(`${name} not found in .env`);
}

function parseMysqlUrl(raw: string): MysqlConn {
	const protocolEnd = raw.indexOf('://');
	if (protocolEnd === -1) {
		throw new Error('Invalid DATABASE_URL: missing protocol');
	}
	const afterProtocol = raw.slice(protocolEnd + 3);
	const slashIdx = afterProtocol.indexOf('/');
	const authority = slashIdx === -1 ? afterProtocol : afterProtocol.slice(0, slashIdx);
	const database = slashIdx === -1 ? '' : afterProtocol.slice(slashIdx + 1);
	const lastAt = authority.lastIndexOf('@');
	if (lastAt === -1) {
		throw new Error('Invalid DATABASE_URL: missing @ between userinfo and host');
	}
	const userinfo = authority.slice(0, lastAt);
	const hostPort = authority.slice(lastAt + 1);
	const firstColon = userinfo.indexOf(':');
	if (firstColon === -1) {
		throw new Error('Invalid DATABASE_URL: missing : between user and password');
	}
	const user = userinfo.slice(0, firstColon);
	const password = userinfo.slice(firstColon + 1);
	const lastColon = hostPort.lastIndexOf(':');
	const host = lastColon === -1 ? hostPort : hostPort.slice(0, lastColon);
	const port = lastColon === -1 ? '' : hostPort.slice(lastColon + 1);
	return { host, port, user, password, database };
}

function getConn(): MysqlConn {
	if (cachedConn) return cachedConn;
	const url = loadEnvVar('DATABASE_URL');
	cachedConn = parseMysqlUrl(url);
	return cachedConn;
}

function quoteValue(value: unknown): string {
	if (value === null || value === undefined) return 'NULL';
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			throw new Error('Cannot serialize non-finite number for MySQL');
		}
		return String(value);
	}
	if (typeof value === 'boolean') return value ? '1' : '0';
	if (value instanceof Date) {
		return `'${value.toISOString().replace(/'/g, "''")}'`;
	}
	const s = String(value);
	return `'${s.replace(/'/g, "''")}'`;
}

function interpolate(sql: string, params: readonly unknown[]): string {
	let result = sql;
	for (const p of params) {
		const idx = result.indexOf('?');
		if (idx === -1) {
			throw new Error('Not enough ? placeholders in SQL for provided params');
		}
		result = result.slice(0, idx) + quoteValue(p) + result.slice(idx + 1);
	}
	return result;
}

function parseTabTable<T extends Record<string, unknown>>(stdout: string): T[] {
	const lines = stdout.split('\n').filter((l) => l.length > 0);
	if (lines.length === 0) return [];
	const headerCells = lines[0].split('\t');
	const dataLines = lines.slice(1);
	return dataLines.map<T>((line) => {
		const cells = line.split('\t');
		const row: Record<string, unknown> = {};
		for (let i = 0; i < headerCells.length; i++) {
			const cell = cells[i] ?? '';
			row[headerCells[i]] = cell.length > 0 ? cell : null;
		}
		return row as T;
	});
}

function buildMysqlArgs(conn: MysqlConn, sql: string): string[] {
	const args: string[] = [
		'-h',
		conn.host,
		'-u',
		conn.user,
		'-p' + conn.password,
	];
	if (conn.port.length > 0) {
		args.push('-P', conn.port);
	}
	args.push('-D', conn.database, '-B', '-e', sql);
	return args;
}

export async function runMysql<T extends Record<string, unknown>>(
	sql: string,
	params: readonly unknown[] = []
): Promise<T[]> {
	const conn = getConn();
	const finalSql = interpolate(sql, params);
	const args = buildMysqlArgs(conn, finalSql);
	const { stdout } = await execFileAsync('mysql', args, {
		timeout: TIMEOUT_MS,
		maxBuffer: MAX_BUFFER_BYTES
	});
	return parseTabTable<T>(stdout);
}

export async function runMysqlOne<T extends Record<string, unknown>>(
	sql: string,
	params: readonly unknown[] = []
): Promise<T | null> {
	const rows = await runMysql<T>(sql, params);
	return rows.length > 0 ? rows[0] : null;
}
