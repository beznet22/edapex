import { describe, it, expect, vi } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';
import type { RequestContextValues } from '$lib/server/mastra/agents/shared';

vi.mock('$lib/server/mastra/skill-tools', () => ({
	ensureRegistry: vi.fn(),
	resolveSkillName: vi.fn((message: string) =>
		message.trim().startsWith('/update') ? 'gov' : null
	),
	skillRegistry: {
		getSkill: vi.fn((name: string) =>
			name === 'gov'
				? {
						name: 'Gov',
						instructions:
							'For self-updates, use tenantContext.staffId. Do not call search-school-directory.'
					}
				: undefined
		)
	}
}));

import { buildAssistantInstructions } from '$lib/server/mastra/agents/instructions';

function createTestContext(
	overrides: Partial<RequestContextValues> = {}
): RequestContext<RequestContextValues> {
	const ctx = new RequestContext<RequestContextValues>();
	ctx.set('tenantContext', {
		schoolId: 1,
		userId: 7,
		designationId: 3,
		staffId: 42,
		roleId: 9,
		classId: 10,
		sectionId: 2,
		examId: null,
		examTypeId: 5,
		academicId: 2026,
		studentId: 101,
		...overrides.tenantContext
	});
	ctx.set('isSlashCommand', overrides.isSlashCommand ?? true);
	ctx.set('lastMessage', overrides.lastMessage ?? '/update my name');
	if (overrides.fileManifest) ctx.set('fileManifest', overrides.fileManifest);
	return ctx;
}

describe('assistant instructions', () => {
	it('injects actual tenant ID values into the system prompt', async () => {
		const requestContext = createTestContext();
		const prompt = await buildAssistantInstructions(requestContext);

		expect(prompt).toContain('School ID: 1');
		expect(prompt).toContain('User ID: 7');
		expect(prompt).toContain('Staff ID: 42');
		expect(prompt).toContain('Role ID: 9');
		expect(prompt).toContain('Designation ID: 3');
		expect(prompt).toContain('Active Academic Year ID: 2026');
		expect(prompt).toContain('Active Class ID: 10');
		expect(prompt).toContain('Active Section ID: 2');
		expect(prompt).toContain('Active Exam Type ID: 5');
		expect(prompt).toContain('Active Student ID: 101');
	});

	it('shows None for nullable IDs when they are null', async () => {
		const requestContext = createTestContext({
			tenantContext: {
				schoolId: 1,
				userId: 7,
				designationId: 3,
				staffId: 42,
				roleId: null,
				classId: null,
				sectionId: null,
				examId: null,
				examTypeId: null,
				academicId: null,
				studentId: null
			}
		});
		const prompt = await buildAssistantInstructions(requestContext);

		expect(prompt).toContain('Role ID: None');
		expect(prompt).toContain('Active Academic Year ID: None');
		expect(prompt).toContain('Active Class ID: None');
		expect(prompt).toContain('Active Section ID: None');
		expect(prompt).toContain('Active Exam Type ID: None');
		expect(prompt).toContain('Active Student ID: None');
	});

	it('injects skill instructions for slash commands', async () => {
		const requestContext = createTestContext({ lastMessage: '/update my name' });
		const prompt = await buildAssistantInstructions(requestContext);

		expect(prompt).toContain('SKILL INSTRUCTIONS — Gov:');
		expect(prompt).toContain('For self-updates, use tenantContext.staffId.');
		expect(prompt).toContain('tenantContext.staffId');
	});

	it('does not inject skill instructions for non-slash commands', async () => {
		const requestContext = createTestContext({
			isSlashCommand: false,
			lastMessage: 'hello'
		});
		const prompt = await buildAssistantInstructions(requestContext);

		expect(prompt).not.toContain('SKILL INSTRUCTIONS');
	});
});
