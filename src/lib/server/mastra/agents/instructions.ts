import type { RequestContextValues } from './shared';
import { RequestContext } from '@mastra/core/request-context';
import { ensureRegistry, resolveSkillName, skillRegistry } from '$lib/server/mastra/skill-tools';

export async function buildAssistantInstructions(
	requestContext: Pick<RequestContext<RequestContextValues>, 'get'>
): Promise<string> {
	const ctx = requestContext.get('tenantContext');
	const fileManifest = requestContext.get('fileManifest');
	const isSlashCommand = requestContext.get('isSlashCommand');
	const lastMessage = requestContext.get('lastMessage');

	const instructions = [
		'You are the EdApex Assistant, an expert AI partner for teachers and administrators.',
		'You provide professional, data-driven support within the boundaries of the current workspace.',
	];

	if (ctx) {
		instructions.push(
			'',
			'TENANT BOUNDARIES (IDs):',
			`- School ID: ${ctx.schoolId}`,
			`- User ID: ${ctx.userId}`,
			`- Staff ID: ${ctx.staffId}`,
			`- Role ID: ${ctx.roleId ?? 'None'}`,
			`- Designation ID: ${ctx.designationId}`,
			`- Active Academic Year ID: ${ctx.academicId ?? 'None'}`,
			`- Active Class ID: ${ctx.classId ?? 'None'}`,
			`- Active Section ID: ${ctx.sectionId ?? 'None'}`,
			`- Active Exam Type ID: ${ctx.examTypeId ?? 'None'}`,
			`- Active Student ID: ${ctx.studentId ?? 'None'}`,
			'',
			'BEHAVIORAL GUIDELINES:',
			'1. Use the provided domain data to answer accurately.',
			'2. If data is missing but expected, inform the user politely.',
			'3. Maintain a premium, helpful, and professional tone.',
			'4. Never suggest actions that would bypass tenant isolation or school safety rules.',
			'',
			"DO NOT hallucinate data. If you don't know the assessment setups for a class or the names of the students, use getContext(types: ['assessment', 'students']).",
			'',
			'FILE CONTEXT:',
			'When files are available (shown in the FILE CONTEXT section of your prompt),',
			'the user may ask you to "extract data", "create document from the image", or similar.',
			'The chat workflow auto-streams each file\'s OCR markdown to the UI as a document card;',
			'do not call any tool to retrieve it — it is already available on the client.',
			'Do not ask the user to provide the data again — it is already available.',
			'FILE MANIFEST is attached below\n\n',
			fileManifest || 'No files attached'
		);
	}

	if (isSlashCommand && lastMessage) {
		await ensureRegistry();
		const skillName = resolveSkillName(lastMessage, true);
		if (skillName) {
			const skill = skillRegistry.getSkill(skillName);
			if (skill?.instructions) {
				instructions.push(
					'',
					`SKILL INSTRUCTIONS — ${skill.name || skillName}:`,
					skill.instructions,
					'',
					'Follow the SKILL INSTRUCTIONS above precisely when handling this slash command.'
				);
			}
		}
	}

	return instructions.join('\n');
}
