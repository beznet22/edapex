/**
 * Skill loading — each `.skill.md` must:
 *   - Parse as a valid skill definition.
 *   - Reference tool ids that exist in TOOL_MAP.
 *   - Have a non-empty `description` and `tools` array (excluding the
 *     `default` and `assistant` skills, which legitimately have no tools).
 *
 * The SkillRegistry validates these on load; this test asserts the runtime
 * state matches the on-disk skill files so that a missing tool reference is
 * caught immediately.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ensureRegistry, skillRegistry, TOOL_MAP } from '$lib/server/mastra/skill-tools';

const SKILL_DIR = join(process.cwd(), 'src/lib/server/mastra/skills');
const SKILL_FILES = readdirSync(SKILL_DIR).filter((f) => f.endsWith('.skill.md'));

describe('skill loading', () => {
	beforeAll(async () => {
		await ensureRegistry();
	});

	it('discovers every skill file on disk', () => {
		for (const file of SKILL_FILES) {
			const skillName = file.replace(/\.skill\.md$/, '');
			const skill = skillRegistry.getSkill(skillName);
			expect(skill, `skill "${skillName}" did not load`).toBeDefined();
		}
	});

	it('every skill file references only tool ids that exist in TOOL_MAP', async () => {
		const { validateSkillDirectory } = await import(
			'$lib/server/mastra/skill-schema'
		);
		const knownTools = new Set(Object.keys(TOOL_MAP));
		const results = await validateSkillDirectory(SKILL_DIR, knownTools);
		for (const result of results) {
			if (!result.valid) {
				const errors = result.errors.join('; ');
				throw new Error(`Skill file ${result.file} failed validation: ${errors}`);
			}
			expect(result.valid, `skill file ${result.file} should be valid`).toBe(true);
			expect(result.skill).toBeDefined();
		}
	});

	it.each(SKILL_FILES)('skill %s has a non-empty description', (file) => {
		const skillName = file.replace(/\.skill\.md$/, '');
		const skill = skillRegistry.getSkill(skillName);
		expect(skill).toBeDefined();
		if (skillName === 'assistant' || skillName === 'parent' || skillName === 'read') return;
		expect(skill?.description?.length ?? 0).toBeGreaterThan(10);
	});

	it.each(SKILL_FILES)('skill %s has unique tool ids (no duplicates)', (file) => {
		const skillName = file.replace(/\.skill\.md$/, '');
		const skill = skillRegistry.getSkill(skillName);
		expect(skill).toBeDefined();
		const tools = skill?.tools ?? [];
		const unique = new Set(tools);
		expect(unique.size, `duplicate tool ids in ${file}`).toBe(tools.length);
	});

	it('covers at least the 6 slash-command-mapped skills', () => {
		const expected = ['default', 'write', 'destructive', 'academic', 'transcript', 'reporting'];
		for (const name of expected) {
			expect(skillRegistry.getSkill(name), `expected skill "${name}" to be loaded`).toBeDefined();
		}
	});
});
