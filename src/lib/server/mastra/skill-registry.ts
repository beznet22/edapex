import { readFileSync } from 'node:fs';
import {
	parseSkillFile,
	validateSkillDirectory,
	type SkillDefinition,
	type ValidationResult
} from './skill-schema';

export interface SkillManifest {
	version: number;
	generatedAt: string;
	skills: Record<string, SkillDefinition>;
	errors: Array<{ file: string; errors: string[] }>;
}

/**
 * Generate a static `skills.json` manifest from a skill directory.
 * Production instances load this pre-validated manifest for zero-latency
 * skill discovery without file watchers (spec: mastra_migration_specs.md L48).
 *
 * Only skills that pass both Zod schema validation AND tool existence
 * checks are included. Rejected skills are recorded in the `errors` array
 * for CI reporting.
 */
export async function generateSkillManifest(
	skillDir: string,
	knownTools: Set<string>
): Promise<SkillManifest> {
	const results = await validateSkillDirectory(skillDir, knownTools);
	const skills: Record<string, SkillDefinition> = {};
	const errors: Array<{ file: string; errors: string[] }> = [];

	for (const result of results) {
		if (result.valid && result.skill) {
			const key = result.skill.name.toLowerCase();
			skills[key] = result.skill;
		} else {
			errors.push({ file: result.file, errors: result.errors });
		}
	}

	return {
		version: 1,
		generatedAt: new Date().toISOString(),
		skills,
		errors
	};
}

/**
 * Load a pre-built `skills.json` manifest from disk.
 * Used in production for zero-latency skill discovery.
 */
export function loadSkillManifest(manifestPath: string): SkillManifest {
	const raw = readFileSync(manifestPath, 'utf-8');
	return JSON.parse(raw) as SkillManifest;
}

/**
 * In-memory skill registry backed by either a directory scan (dev)
 * or a pre-built manifest (production).
 */
export class SkillRegistry {
	private skills = new Map<string, SkillDefinition>();

	loadFromManifest(manifest: SkillManifest): void {
		this.skills.clear();
		for (const [key, skill] of Object.entries(manifest.skills)) {
			this.skills.set(key, skill);
		}
	}

	async loadFromDirectory(skillDir: string, knownTools: Set<string>): Promise<SkillManifest> {
		const manifest = await generateSkillManifest(skillDir, knownTools);
		this.loadFromManifest(manifest);
		return manifest;
	}

	getSkill(name: string): SkillDefinition | undefined {
		return this.skills.get(name.toLowerCase());
	}

	getToolsForSkill(name: string): string[] {
		const skill = this.skills.get(name.toLowerCase());
		return skill ? skill.tools : [];
	}

	listSkills(): string[] {
		return Array.from(this.skills.keys());
	}

	listSlashCommands(): string[] {
		return Array.from(this.skills.values()).map((s) => s.slashCommand);
	}

	get size(): number {
		return this.skills.size;
	}
}
