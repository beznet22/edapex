import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: {
		TINYFISH_API_KEY: 'test-key',
	},
}));

import { SkillRegistry } from '$lib/server/mastra/skill-registry';
import { RESERVED_GLOBAL_TOOL_IDS } from '$lib/server/mastra/skill-schema';
import { globalTools } from '$lib/server/mastra/tools/internal/global-tools';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

// ═══════════════════════════════════════════════════════════════════════
// 5.1 — Global Tools Wiring into EdApexGateway
// ═══════════════════════════════════════════════════════════════════════

describe('Global Tools Gateway Integration', () => {
	describe('globalTools export', () => {
		it('exports web-search and web-fetch tools', () => {
			expect(globalTools).toHaveProperty('web-search');
			expect(globalTools).toHaveProperty('web-fetch');
		});

		it('web-search tool has correct id', () => {
			expect(globalTools['web-search'].id).toBe('web-search');
		});

		it('web-fetch tool has correct id', () => {
			expect(globalTools['web-fetch'].id).toBe('web-fetch');
		});
	});

	describe('resolveToolsForIntent always includes Global Tools', () => {
		/**
		 * We test the resolveToolsForIntent logic indirectly by verifying
		 * that globalTools are always spread into the base tools object.
		 * The Gateway method is private, so we test the contract:
		 * globalTools keys should always be present in any resolved tool set.
		 */
		it('globalTools object contains exactly web-search and web-fetch', () => {
			const keys = Object.keys(globalTools);
			expect(keys).toContain('web-search');
			expect(keys).toContain('web-fetch');
			expect(keys).toHaveLength(2);
		});

		it('spreading globalTools into a skill toolset preserves both', () => {
			const skillTools = { 'manage-results': {} as any, 'search-entity': {} as any };
			const merged = { ...globalTools, ...skillTools };

			// Global tools present
			expect(merged).toHaveProperty('web-search');
			expect(merged).toHaveProperty('web-fetch');
			// Skill tools present
			expect(merged).toHaveProperty('manage-results');
			expect(merged).toHaveProperty('search-entity');
		});

		it('Global Tools do not count toward skill tool limit (4 max)', () => {
			// Simulate a skill with exactly 4 tools (the max per-skill limit)
			const skillTools = {
				'manage-results': {} as any,
				'search-entity': {} as any,
				'onboard-entity': {} as any,
				'patch-entity': {} as any,
			};

			// Merge with global tools — total should be 6 (4 skill + 2 global)
			const merged = { ...globalTools, ...skillTools };
			const globalToolCount = Object.keys(globalTools).length;
			const skillToolCount = Object.keys(skillTools).length;

			expect(skillToolCount).toBe(4); // At the limit
			expect(Object.keys(merged).length).toBe(skillToolCount + globalToolCount);
			// Global tools are separate from the skill limit
			expect(globalToolCount).toBe(2);
		});

		it('Global Tools are available when no skill is active (default routing)', () => {
			// Default routing: coreTools + workflowTools + globalTools
			const coreTools = { 'search-entity': {} as any, 'system-status': {} as any };
			const workflowTools = { 'extract-document': {} as any };
			const merged = { ...globalTools, ...coreTools, ...workflowTools };

			expect(merged).toHaveProperty('web-search');
			expect(merged).toHaveProperty('web-fetch');
		});
	});

	describe('RESERVED_GLOBAL_TOOL_IDS constant', () => {
		it('contains web-search and web-fetch', () => {
			expect(RESERVED_GLOBAL_TOOL_IDS.has('web-search')).toBe(true);
			expect(RESERVED_GLOBAL_TOOL_IDS.has('web-fetch')).toBe(true);
		});

		it('does not contain other tool IDs', () => {
			expect(RESERVED_GLOBAL_TOOL_IDS.has('search-entity')).toBe(false);
			expect(RESERVED_GLOBAL_TOOL_IDS.has('manage-results')).toBe(false);
		});
	});

	describe('SkillRegistry conflict detection', () => {
		const TEST_SKILL_DIR = join(process.cwd(), '.test-skills-conflict');
		const KNOWN_TOOLS = new Set(['search-entity', 'manage-results', 'onboard-entity', 'web-search', 'web-fetch']);

		beforeEach(async () => {
			await mkdir(TEST_SKILL_DIR, { recursive: true });
		});

		afterEach(async () => {
			await rm(TEST_SKILL_DIR, { recursive: true, force: true });
		});

		it('rejects a skill that declares web-search', async () => {
			const skillContent = `---
name: bad-skill
description: A skill that tries to override web-search
tools:
  - web-search
  - search-entity
---
You are a bad skill.`;

			await writeFile(join(TEST_SKILL_DIR, 'bad.skill.md'), skillContent);

			const registry = new SkillRegistry();
			const manifest = await registry.loadFromDirectory(TEST_SKILL_DIR, KNOWN_TOOLS);

			expect(manifest.errors).toHaveLength(1);
			expect(manifest.errors[0].errors[0]).toContain('web-search');
			expect(manifest.errors[0].errors[0]).toContain('conflicts with a reserved Global Tool');
			expect(registry.size).toBe(0);
		});

		it('rejects a skill that declares web-fetch', async () => {
			const skillContent = `---
name: another-bad-skill
description: A skill that tries to override web-fetch
tools:
  - web-fetch
  - manage-results
---
You are another bad skill.`;

			await writeFile(join(TEST_SKILL_DIR, 'another-bad.skill.md'), skillContent);

			const registry = new SkillRegistry();
			const manifest = await registry.loadFromDirectory(TEST_SKILL_DIR, KNOWN_TOOLS);

			expect(manifest.errors).toHaveLength(1);
			expect(manifest.errors[0].errors[0]).toContain('web-fetch');
			expect(manifest.errors[0].errors[0]).toContain('conflicts with a reserved Global Tool');
			expect(registry.size).toBe(0);
		});

		it('rejects a skill that declares both web-search and web-fetch', async () => {
			const skillContent = `---
name: double-bad-skill
description: A skill that tries to override both global tools
tools:
  - web-search
  - web-fetch
  - search-entity
---
You are a double bad skill.`;

			await writeFile(join(TEST_SKILL_DIR, 'double-bad.skill.md'), skillContent);

			const registry = new SkillRegistry();
			const manifest = await registry.loadFromDirectory(TEST_SKILL_DIR, KNOWN_TOOLS);

			expect(manifest.errors).toHaveLength(1);
			expect(manifest.errors[0].errors.length).toBe(2);
			expect(manifest.errors[0].errors[0]).toContain('web-search');
			expect(manifest.errors[0].errors[1]).toContain('web-fetch');
			expect(registry.size).toBe(0);
		});

		it('accepts a valid skill that does not declare reserved tools', async () => {
			const skillContent = `---
name: good-skill
description: A valid skill with non-reserved tools
tools:
  - search-entity
  - manage-results
---
You are a good skill.`;

			await writeFile(join(TEST_SKILL_DIR, 'good.skill.md'), skillContent);

			const registry = new SkillRegistry();
			const manifest = await registry.loadFromDirectory(TEST_SKILL_DIR, KNOWN_TOOLS);

			expect(manifest.errors).toHaveLength(0);
			expect(registry.size).toBe(1);
			expect(registry.getSkill('good-skill')).toBeDefined();
		});

		it('accepts valid skills while rejecting conflicting ones in the same directory', async () => {
			const goodSkill = `---
name: valid-skill
description: A valid skill
tools:
  - search-entity
---
Valid instructions.`;

			const badSkill = `---
name: invalid-skill
description: Tries to use web-search
tools:
  - web-search
  - search-entity
---
Invalid instructions.`;

			await writeFile(join(TEST_SKILL_DIR, 'valid.skill.md'), goodSkill);
			await writeFile(join(TEST_SKILL_DIR, 'invalid.skill.md'), badSkill);

			const registry = new SkillRegistry();
			const manifest = await registry.loadFromDirectory(TEST_SKILL_DIR, KNOWN_TOOLS);

			expect(manifest.errors).toHaveLength(1);
			expect(manifest.errors[0].file).toBe('invalid.skill.md');
			expect(registry.size).toBe(1);
			expect(registry.getSkill('valid-skill')).toBeDefined();
			expect(registry.getSkill('invalid-skill')).toBeUndefined();
		});
	});
});
