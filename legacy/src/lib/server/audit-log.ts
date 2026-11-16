import fs from "fs/promises";
import path from "path";
import { z } from "zod";

export const AUDIT_ACTIONS = [
	"create",
	"update",
	"delete",
	"enable",
	"disable",
	"export",
	"import",
	"access"
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

const AuditEntrySchema = z.object({
	ts: z.string(),
	actorStaffId: z.number(),
	action: z.enum(AUDIT_ACTIONS),
	entityType: z.string(),
	entityId: z.union([z.string(), z.number()]),
	before: z.unknown().optional(),
	after: z.unknown().optional()
});

export type AuditEntry = z.infer<typeof AuditEntrySchema>;

export interface AuditLogInput {
	schoolId: number;
	actorStaffId: number;
	action: AuditAction;
	entityType: string;
	entityId: string | number;
	before?: unknown;
	after?: unknown;
}

const REDACTED = "[REDACTED]";

const SENSITIVE_KEY_PATTERNS: readonly string[] = [
	"apikey",
	"api_key",
	"passphrase",
	"password",
	"secret",
	"token",
	"credentials",
	"encryptedkey",
	"encrypted_key"
];

function isSensitiveKey(key: string): boolean {
	const lower = key.toLowerCase();
	return SENSITIVE_KEY_PATTERNS.some((pattern) => lower.includes(pattern));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function redactValue(value: unknown): unknown {
	if (isRecord(value)) {
		const result: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) {
			result[k] = isSensitiveKey(k) ? REDACTED : redactValue(v);
		}
		return result;
	}
	if (Array.isArray(value)) {
		return value.map(redactValue);
	}
	return value;
}

function auditDir(): string {
	return path.join(process.cwd(), "data", "audit-log");
}

function auditPath(schoolId: number): string {
	return path.join(auditDir(), `${schoolId}.jsonl`);
}

async function ensureDir(): Promise<void> {
	await fs.mkdir(auditDir(), { recursive: true });
}

export async function log(input: AuditLogInput): Promise<void> {
	await ensureDir();
	const entry: AuditEntry = {
		ts: new Date().toISOString(),
		actorStaffId: input.actorStaffId,
		action: input.action,
		entityType: input.entityType,
		entityId: input.entityId,
		before: redactValue(input.before),
		after: redactValue(input.after)
	};
	const line = JSON.stringify(entry) + "\n";
	await fs.appendFile(auditPath(input.schoolId), line, "utf8");
}

export async function readRecent(schoolId: number, limit = 50): Promise<AuditEntry[]> {
	await ensureDir();
	let raw: string;
	try {
		raw = await fs.readFile(auditPath(schoolId), "utf8");
	} catch (err) {
		if (err instanceof Error && "code" in err && err.code === "ENOENT") {
			return [];
		}
		throw err;
	}
	const lines = raw.split("\n").filter((line) => line.length > 0);
	const entries: AuditEntry[] = [];
	for (const line of lines) {
		const parsed = AuditEntrySchema.safeParse(JSON.parse(line));
		if (parsed.success) {
			entries.push(parsed.data);
		}
	}
	return entries.slice(-limit).reverse();
}
