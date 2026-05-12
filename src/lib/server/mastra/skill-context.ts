import type { Client } from '@libsql/client';
import type { SkillWatcher } from './skill-watcher';
import type { SkillRegistry } from './skill-registry';
import type { SkillStateManager } from './skill-state';

/**
 * Designation IDs from the whitelist (spec: mastra_migration_specs.md §3.2 L166-169).
 * Only these roles may access AI orchestration.
 */
export const ALLOWED_DESIGNATIONS = {
	IT: 1,
	COORDINATOR: 5,
	CLASS_TEACHER: 8
} as const;

type DesignationId = (typeof ALLOWED_DESIGNATIONS)[keyof typeof ALLOWED_DESIGNATIONS];

/**
 * Resolved @mention context injected into the agent's lookup index.
 */
export interface MentionResolution {
	type: 'student' | 'class';
	entityIds: number[];
	classId: number;
	sectionId: number;
	source: 'direct' | 'class_expansion';
}

/**
 * Contextual hydration for @Class mentions (spec: mastra_migration_specs.md L174-176).
 * IT/Coordinators can @mention Classes; Class Teachers are restricted to their sandbox.
 * @Class triggers background fetch of student IDs.
 */
export async function hydrateClassMention(
	classId: number,
	sectionId: number,
	callerDesignation: DesignationId,
	callerClassId: number | null,
	fetchStudentIds: (classId: number, sectionId: number) => Promise<number[]>
): Promise<MentionResolution> {
	if (callerDesignation === ALLOWED_DESIGNATIONS.CLASS_TEACHER) {
		if (callerClassId !== classId) {
			throw new Error(
				`WORKSPACE_MISMATCH: Class Teacher can only @mention their assigned class (assigned: ${callerClassId}, requested: ${classId})`
			);
		}
	}

	if (
		callerDesignation !== ALLOWED_DESIGNATIONS.IT &&
		callerDesignation !== ALLOWED_DESIGNATIONS.COORDINATOR &&
		callerDesignation !== ALLOWED_DESIGNATIONS.CLASS_TEACHER
	) {
		throw new Error(`403 Forbidden: Designation ${callerDesignation} is not authorized.`);
	}

	const studentIds = await fetchStudentIds(classId, sectionId);

	return {
		type: 'class',
		entityIds: studentIds,
		classId,
		sectionId,
		source: 'class_expansion'
	};
}

export interface HealthStatus {
	status: 'healthy' | 'degraded' | 'unhealthy';
	components: {
		watcher: { status: string; lockReason: string | null };
		database: { status: string; error: string | null };
		skills: { registered: number; active: number };
	};
	timestamp: string;
}

/**
 * Health endpoint aggregation (spec: implementation_checklist.md L31).
 * Reports watcher, DB, and skill status for /api/mastra/health.
 */
export async function getHealthStatus(
	watcher: SkillWatcher | null,
	dbClient: Client,
	registry: SkillRegistry,
	stateManager: SkillStateManager
): Promise<HealthStatus> {
	const watcherState = watcher?.getStatus() ?? { status: 'disabled', lockReason: null };

	let dbStatus: { status: string; error: string | null } = { status: 'connected', error: null };
	try {
		await dbClient.execute('SELECT 1');
	} catch (error: unknown) {
		dbStatus = {
			status: 'error',
			error: error instanceof Error ? error.message : String(error)
		};
	}

	const overall =
		dbStatus.status === 'error'
			? 'unhealthy'
			: watcherState.status === 'dead'
				? 'degraded'
				: 'healthy';

	return {
		status: overall,
		components: {
			watcher: { status: watcherState.status, lockReason: watcherState.lockReason },
			database: dbStatus,
			skills: { registered: registry.size, active: stateManager.activeSessions }
		},
		timestamp: new Date().toISOString()
	};
}
