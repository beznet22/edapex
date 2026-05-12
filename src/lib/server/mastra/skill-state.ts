import type { Client } from '@libsql/client';

type SkillStatus = 'active' | 'locked' | 'idle';

interface ActiveSkillState {
	sessionId: string;
	skillName: string;
	status: SkillStatus;
	activatedAt: number;
}

/**
 * Global tools that bypass skill locks (spec: mastra_migration_specs.md L122).
 * These remain executable even during a high-priority Lock turn.
 */
const LOCK_BYPASS_TOOLS = new Set(['manageAccess', 'systemStatus']);

const ENSURE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS mastra_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

/**
 * Manages per-session active skill state with libSQL persistence.
 *
 * Covers:
 * - State Residency: persists to `mastra_metadata` to survive crashes
 * - Autonomous Switch: intent-aware `switchSkill()` with lock detection
 * - Interruption Recovery: detects ambiguous cross-domain requests
 * - Lock Bypass: `manageAccess`/`systemStatus` always allowed
 */
export class SkillStateManager {
	private sessions = new Map<string, ActiveSkillState>();

	constructor(private readonly client: Client) {}

	async init(): Promise<void> {
		await this.client.execute(ENSURE_TABLE_SQL);
		await this.restoreFromDb();
	}

	async activateSkill(
		sessionId: string,
		skillName: string,
		locked: boolean
	): Promise<void> {
		const state: ActiveSkillState = {
			sessionId,
			skillName,
			status: locked ? 'locked' : 'active',
			activatedAt: Date.now()
		};

		this.sessions.set(sessionId, state);
		await this.persistToDb(sessionId, state);
	}

	async deactivateSkill(sessionId: string): Promise<void> {
		this.sessions.delete(sessionId);
		await this.client.execute({
			sql: 'DELETE FROM mastra_metadata WHERE key = ?',
			args: [`skill_state:${sessionId}`]
		});
	}

	getActiveSkill(sessionId: string): ActiveSkillState | null {
		return this.sessions.get(sessionId) ?? null;
	}

	/**
	 * Intent-aware skill switching (spec: mastra_migration_specs.md L121).
	 * Returns a result indicating whether the switch was allowed,
	 * denied (locked), or requires confirmation (ambiguous).
	 */
	async switchSkill(
		sessionId: string,
		newSkillName: string,
		isLocked: boolean
	): Promise<SwitchResult> {
		const current = this.sessions.get(sessionId);

		if (!current) {
			await this.activateSkill(sessionId, newSkillName, isLocked);
			return { action: 'switched', from: null, to: newSkillName };
		}

		if (current.status === 'locked') {
			return {
				action: 'denied',
				from: current.skillName,
				to: newSkillName,
				reason: `Skill "${current.skillName}" is locked. Use /exit or /clear to unlock first.`
			};
		}

		await this.activateSkill(sessionId, newSkillName, isLocked);
		return { action: 'switched', from: current.skillName, to: newSkillName };
	}

	/**
	 * Detect ambiguous cross-domain requests that require confirmation
	 * (spec: mastra_migration_specs.md L123).
	 */
	evaluateInterruption(
		sessionId: string,
		detectedSkill: string
	): InterruptionResult {
		const current = this.sessions.get(sessionId);

		if (!current) {
			return { needsConfirmation: false };
		}

		if (current.skillName === detectedSkill) {
			return { needsConfirmation: false };
		}

		if (current.status === 'locked') {
			return {
				needsConfirmation: true,
				currentSkill: current.skillName,
				requestedSkill: detectedSkill,
				message: `I'm currently in a locked "${current.skillName}" session. Should I switch to "${detectedSkill}"? Use /exit to unlock first.`
			};
		}

		return {
			needsConfirmation: true,
			currentSkill: current.skillName,
			requestedSkill: detectedSkill,
			message: `I've been working in "${current.skillName}". Should I switch to the "${detectedSkill}" skill to handle this?`
		};
	}

	/**
	 * Lock bypass check (spec: mastra_migration_specs.md L122).
	 * manageAccess and systemStatus always executable.
	 */
	isToolAllowed(sessionId: string, toolName: string): boolean {
		if (LOCK_BYPASS_TOOLS.has(toolName)) {
			return true;
		}

		const current = this.sessions.get(sessionId);

		if (!current || current.status !== 'locked') {
			return true;
		}

		return false;
	}

	/**
	 * Check if a tool belongs to the active skill's toolset.
	 */
	isToolInActiveSkill(sessionId: string, toolName: string, skillTools: string[]): boolean {
		if (LOCK_BYPASS_TOOLS.has(toolName)) return true;

		const current = this.sessions.get(sessionId);
		if (!current) return true;

		return skillTools.includes(toolName);
	}

	private async persistToDb(sessionId: string, state: ActiveSkillState): Promise<void> {
		await this.client.execute({
			sql: `INSERT OR REPLACE INTO mastra_metadata (key, value, updated_at)
				VALUES (?, ?, datetime('now'))`,
			args: [`skill_state:${sessionId}`, JSON.stringify(state)]
		});
	}

	private async restoreFromDb(): Promise<void> {
		const result = await this.client.execute(
			"SELECT key, value FROM mastra_metadata WHERE key LIKE 'skill_state:%'"
		);

		for (const row of result.rows) {
			const state = JSON.parse(row.value as string) as ActiveSkillState;
			this.sessions.set(state.sessionId, state);
		}
	}

	get activeSessions(): number {
		return this.sessions.size;
	}
}

export interface SwitchResult {
	action: 'switched' | 'denied';
	from: string | null;
	to: string;
	reason?: string;
}

export interface InterruptionResult {
	needsConfirmation: boolean;
	currentSkill?: string;
	requestedSkill?: string;
	message?: string;
}
