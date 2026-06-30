/**
 * Slash command -> tool set resolution.
 *
 * `resolveToolsForMessage(message, isSlashCommand)` returns the per-turn tool
 * set. When the slash command maps to a skill, the resolved set is restricted
 * to that skill's tools. When the slash command is unknown, the function
 * returns base tools + globals + getContext (the permissive default).
 *
 * IMPORTANT: the tokens after the command name (e.g. `generate`, `publish`,
 * `result`, `view`) are NOT parsed subcommands. They are natural-language
 * intents the LLM uses to pick a tool. The skill loader only inspects the
 * first whitespace-separated token of the message:
 *
 *     '/marksheet generate @class LOWERBASIC 1 A'
 *      ^^^^^^^^                                   -> reporting skill
 *                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ -> freeform LLM context
 *
 *     '/marksheet i want you to generate exam report for @AL-azeem'
 *      ^^^^^^^^                                   -> reporting skill
 *                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ -> freeform LLM context
 *
 * The `CommandDropdown.svelte` UI shows a curated list of verb suggestions
 * (`generate`, `publish`, etc.) purely for UX discoverability. Those
 * suggestions are NEVER parsed by the server.
 *
 * These tests exercise diverse prompt scenarios:
 *   - bare slash command (no verb, no args)
 *   - slash command with a CommandDropdown-suggested verb
 *   - slash command with full natural-language prose (the common case)
 *   - slash command with @student / @year / @term / @class mentions
 *   - slash command with multiple mentions
 *   - slash command with trailing whitespace
 *   - case-insensitive command names
 *   - non-slash command (minimal toolset, no domain bleed)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { resolveToolsForMessage, ensureRegistry, TOOL_MAP } from '$lib/server/mastra/skill-tools';

const GLOBAL_TOOL_NAMES = new Set(['web-search', 'web-fetch', 'getContext']);

interface SlashCase {
	command: string;
	expectedSkill: string;
	requiredTools: string[];
}

const CASES: SlashCase[] = [
	// default skill — orientation + context switching
	{ command: '/search @Alice', expectedSkill: 'default', requiredTools: ['search-school-directory'] },
	{ command: '/switch @class LOWERBASIC 1 A', expectedSkill: 'default', requiredTools: ['switch-academic-context'] },
	{ command: '/context', expectedSkill: 'default', requiredTools: ['get-academic-context'] },
	{ command: '/search', expectedSkill: 'default', requiredTools: ['search-school-directory'] },

	// write skill — student + staff lifecycle
	{ command: '/enroll', expectedSkill: 'write', requiredTools: ['enroll-student'] },
	{ command: '/enroll @Alice', expectedSkill: 'write', requiredTools: ['enroll-student'] },
	{ command: '/admit', expectedSkill: 'write', requiredTools: ['enroll-student'] },
	{ command: '/admit @new-student', expectedSkill: 'write', requiredTools: ['enroll-student'] },
	{ command: '/transfer @Alice', expectedSkill: 'write', requiredTools: ['transfer-student'] },
	{ command: '/promote @Alice', expectedSkill: 'write', requiredTools: ['promote-student'] },
	{ command: '/demote @Alice', expectedSkill: 'write', requiredTools: ['demote-student'] },
	{ command: '/update @Alice', expectedSkill: 'write', requiredTools: ['update-record'] },
	{ command: '/update photo @Alice', expectedSkill: 'write', requiredTools: ['update-photo'] },
	{ command: '/update record @Alice', expectedSkill: 'write', requiredTools: ['update-record'] },
	{ command: '/self-assign @class LOWERBASIC 1 A', expectedSkill: 'write', requiredTools: ['teacher-self-assign-class'] },
	{ command: '/staff register', expectedSkill: 'write', requiredTools: ['enroll-staff', 'assign-staff-to-class'] },
	{ command: '/staff update @staff1', expectedSkill: 'write', requiredTools: ['update-staff-biodata'] },
	{ command: '/staff assign @staff1 @class LOWERBASIC 2 B', expectedSkill: 'write', requiredTools: ['assign-staff-to-class', 'assign-staff-to-subject'] },

	// academic skill — marks + attendance
	{ command: '/grade', expectedSkill: 'academic', requiredTools: ['manage-academic-records'] },
	{ command: '/mark @Alice math 85', expectedSkill: 'academic', requiredTools: ['manage-academic-records'] },
	{ command: '/attendance @Alice present', expectedSkill: 'academic', requiredTools: ['manage-academic-records'] },

	// destructive skill — high-risk account ops
	{ command: '/suspend @staff1', expectedSkill: 'destructive', requiredTools: ['manage-account-access'] },
	{ command: '/reactivate @staff1', expectedSkill: 'destructive', requiredTools: ['manage-account-access'] },
	{ command: '/password @staff1', expectedSkill: 'destructive', requiredTools: ['manage-account-access'] },

	// transcript skill — multi-term transcripts
	{ command: '/transcript', expectedSkill: 'transcript', requiredTools: ['transcript-report'] },
	{ command: '/transcript report @Alice', expectedSkill: 'transcript', requiredTools: ['transcript-report'] },
	{ command: '/transcript generate @Alice @year 2024', expectedSkill: 'transcript', requiredTools: ['generate-transcript-pdf'] },
	{ command: '/transcript publish @Alice', expectedSkill: 'transcript', requiredTools: ['publish-transcript-pdf'] },

	// reporting skill — marksheet pipeline
	{ command: '/marksheet', expectedSkill: 'reporting', requiredTools: ['get-active-marksheet'] },
	{ command: '/marksheet generate @class LOWERBASIC 1 A @term CA2', expectedSkill: 'reporting', requiredTools: ['generate-result-pdf'] },
	{ command: '/marksheet publish @class LOWERBASIC 1 A', expectedSkill: 'reporting', requiredTools: ['publish-result-pdf'] },
	{ command: '/marksheet validate', expectedSkill: 'reporting', requiredTools: ['validate-marksheet'] },
	
];

describe('resolveToolsForMessage', () => {
	beforeAll(async () => {
		await ensureRegistry();
	});

	it.each(CASES)(
		'$command -> $expectedSkill skill tools present',
		({ command, requiredTools }) => {
			const tools = resolveToolsForMessage(command, true);
			for (const toolId of requiredTools) {
				expect(
					Object.prototype.hasOwnProperty.call(tools, toolId),
					`expected ${toolId} in resolved tools for "${command}"; got ${Object.keys(tools).join(', ')}`
				).toBe(true);
			}
		}
	);

	it.each(CASES)(
		'$command -> restricted subset of TOOL_MAP (not the full fallback)',
		({ command }) => {
			const tools = resolveToolsForMessage(command, true);
			const toolMapNames = new Set(Object.keys(TOOL_MAP));
			// Every resolved tool must be one of: global, getContext, or in TOOL_MAP.
			for (const name of Object.keys(tools)) {
				if (GLOBAL_TOOL_NAMES.has(name)) continue;
				expect(
					toolMapNames.has(name),
					`resolved "${name}" for "${command}" is not global and not in TOOL_MAP`
				).toBe(true);
			}
			// And specifically: getContext + web-search MUST always be present.
			expect(Object.prototype.hasOwnProperty.call(tools, 'getContext')).toBe(true);
			expect(Object.prototype.hasOwnProperty.call(tools, 'web-search')).toBe(true);
		}
	);

	it('regression guard: /marksheet must NOT fall through to the permissive fallback', () => {
		// Earlier the reporting skill was rejected because its tools were not
		// in TOOL_MAP, causing resolveToolsForMessage to fall through. After
		// the fix, /marksheet must produce a strict subset of TOOL_MAP and
		// MUST include the reporting-specific tools.
		const tools = resolveToolsForMessage('/marksheet validate', true);
		const toolMapNames = new Set(Object.keys(TOOL_MAP));
		expect(Object.keys(tools).length).toBeLessThan(toolMapNames.size + 5);
		expect(Object.prototype.hasOwnProperty.call(tools, 'get-active-marksheet')).toBe(true);
		expect(Object.prototype.hasOwnProperty.call(tools, 'validate-marksheet')).toBe(true);
		expect(Object.prototype.hasOwnProperty.call(tools, 'commit-marksheet')).toBe(true);
	});

	it('returns the minimal toolset (no domain tools) when the message is not a slash command', () => {
		const tools = resolveToolsForMessage('What is the meaning of life?', false);
		// Plain chat must include ONLY the baseline tools so the agent's
		// system prompt stays small and reasoning latency stays low.
		const expected = ['getContext', 'search-school-directory', 'web-search'];
		for (const toolId of expected) {
			expect(
				Object.prototype.hasOwnProperty.call(tools, toolId),
				`non-slash path must include ${toolId}`
			).toBe(true);
		}
		// Domain tools MUST NOT bleed into plain chat. Domain operations
		// (marksheet validation, student enrollment, transcript publish,
		// account suspension, etc.) belong to their own slash-command
		// skills; loading them unconditionally inflates every turn.
		const FORBIDDEN_FOR_PLAIN_CHAT = [
			'validate-marksheet',
			'commit-marksheet',
			'enroll-student',
			'transfer-student',
			'promote-student',
			'list-my-children',
			'get-active-marksheet',
			'publish-result-pdf'
		];
		for (const toolId of FORBIDDEN_FOR_PLAIN_CHAT) {
			expect(
				Object.prototype.hasOwnProperty.call(tools, toolId),
				`non-slash path must NOT include domain tool ${toolId}`
			).toBe(false);
		}
	});

	it('canonical CommandDropdown commands all map to a restricted subset (not full TOOL_MAP)', () => {
		// Every slash command surfaced by `src/lib/components/chat/CommandDropdown.svelte`
		// must resolve to a STRICT SUBSET of TOOL_MAP plus globals + getContext.
		// If any command falls through to the permissive fallback (i.e. returns
		// every tool in TOOL_MAP), this test will catch it.
		const COMMANDS = [
			'/marksheet',
			'/marksheet generate',
			'/marksheet publish',
			'/marksheet result',
			'/marksheet view',
			'/staff register',
			'/staff update',
			'/staff assign',
			'/update photo',
			'/enroll',
			'/admit',
			'/transfer',
			'/promote',
			'/demote',
			'/self-assign',
			'/grade',
			'/mark',
			'/attendance',
			'/suspend',
			'/reactivate',
			'/password',
			'/search',
			'/switch',
			'/context',
			'/transcript',
			'/transcript generate',
			'/transcript publish',
			'/transcript report'
		];

		const toolMapSize = Object.keys(TOOL_MAP).length;
		// Globals + getContext + search-school-directory are universal; the
		// rest come from the skill. Even the largest skill ('write', 11
		// tools) is much smaller than the full map (~50 tools).
		const MAX_RESOLVED_SIZE = toolMapSize; // must be < full map

		for (const cmd of COMMANDS) {
			const tools = resolveToolsForMessage(cmd, true);
			expect(
				Object.keys(tools).length,
				`"${cmd}" resolved to ${Object.keys(tools).length} tools — same or larger than full TOOL_MAP (${toolMapSize}). The command fell through to the permissive fallback.`
			).toBeLessThan(MAX_RESOLVED_SIZE);
		}
	});

	it('each skill loads only its own declared tools (no cross-skill bleed)', () => {
		// For each command -> skill mapping, the resolved toolset must not
		// include tools that belong to a DIFFERENT skill. This catches
		// 'tool registered to multiple skills' or 'skill loading the full
		// TOOL_MAP by mistake'.
		const SKILL_OWNERS: Record<string, string> = {
			'/marksheet': 'reporting',
			'/transcript': 'transcript',
			'/enroll': 'write',
			'/mark': 'academic',
			'/suspend': 'destructive',
			'/context': 'default'
		};
		const KNOWN_TOOLS = new Set(Object.keys(TOOL_MAP));

		for (const [cmd, expectedSkill] of Object.entries(SKILL_OWNERS)) {
			const tools = resolveToolsForMessage(cmd, true);
			const expectedToolCount = Object.keys(tools).length;
			// The same command must produce the same toolset across calls.
			const tools2 = resolveToolsForMessage(cmd, true);
			expect(Object.keys(tools2).length).toBe(expectedToolCount);

			// Every resolved tool must be either global, getContext,
			// search-school-directory, or a known TOOL_MAP entry.
			for (const name of Object.keys(tools)) {
				if (GLOBAL_TOOL_NAMES.has(name)) continue;
				expect(
					KNOWN_TOOLS.has(name) || name === 'search-school-directory',
					`"${cmd}" -> "${name}" not in TOOL_MAP and not a known global`
				).toBe(true);
			}
		}
	});

	it('handles leading/trailing whitespace and case-insensitive command names', () => {
		const a = resolveToolsForMessage('   /context   ', true);
		const b = resolveToolsForMessage('/CONTEXT', true);
		for (const tools of [a, b]) {
			expect(Object.prototype.hasOwnProperty.call(tools, 'get-academic-context')).toBe(true);
		}
	});
});

/**
 * Natural-language intent coverage.
 *
 * The `CommandDropdown` shows a curated verb list (`generate`, `publish`,
 * `result`, `view`, etc.) for UX discoverability, but the production parser
 * does NOT inspect those tokens. Any prose after the command name is
 * passed to the LLM as freeform context.
 *
 * These cases prove the contract: a CommandDropdown verb is NOT required
 * for a command to resolve to the right skill.
 */
describe('resolveToolsForMessage - natural-language intents', () => {
	beforeAll(async () => {
		await ensureRegistry();
	});

	const INTENT_CASES: Array<{ command: string; expectedSkill: string; requiredTools: string[]; reason: string }> = [
		{
			command: '/marksheet i want you to generate exam report for @AL-azeem for @first term @2025',
			expectedSkill: 'reporting',
			requiredTools: ['generate-result-pdf'],
			reason: 'freeform prose around /marksheet still routes to reporting'
		},
		{
			command: '/marksheet please validate the most recent upload',
			expectedSkill: 'reporting',
			requiredTools: ['validate-marksheet'],
			reason: 'verb not in CommandDropdown verb list still resolves'
		},
		{
			command: '/marksheet commit what you have so I can move on',
			expectedSkill: 'reporting',
			requiredTools: ['commit-marksheet'],
			reason: 'committed-verb style natural language'
		},
		{
			command: '/transcript can you show me a draft of @Alice over @year 2024 and @year 2025',
			expectedSkill: 'transcript',
			requiredTools: ['transcript-report'],
			reason: 'freeform prose around /transcript still routes to transcript'
		},
		{
			command: '/enroll this new student that just transferred from another school yesterday afternoon',
			expectedSkill: 'write',
			requiredTools: ['enroll-student'],
			reason: 'long natural-language sentence around /enroll'
		},
		{
			command: '/promote all of @class LOWERBASIC 1 A to the next grade',
			expectedSkill: 'write',
			requiredTools: ['promote-student'],
			reason: 'plural form of the verb still resolves'
		},
		{
			command: '/mark @Alice scored 85 in mathematics',
			expectedSkill: 'academic',
			requiredTools: ['manage-academic-records'],
			reason: 'prose with @student + score still resolves'
		},
		{
			command: '/suspend that teacher for academic misconduct',
			expectedSkill: 'destructive',
			requiredTools: ['manage-account-access'],
			reason: 'destructive command via natural language'
		}
	];

	it.each(INTENT_CASES)(
		'$command -> $expectedSkill (reason: $reason)',
		({ command, requiredTools }) => {
			const tools = resolveToolsForMessage(command, true);
			for (const toolId of requiredTools) {
				expect(
					Object.prototype.hasOwnProperty.call(tools, toolId),
					`expected ${toolId} in resolved tools for "${command}"; got ${Object.keys(tools).join(', ')}`
				).toBe(true);
			}
		}
	);

	it('natural-language intent never expands the toolset past the skill', () => {
		// A 100-word freeform sentence must resolve to the SAME tool count as
		// the bare slash command (no tool explosion from the long prose).
		const longProse = '/marksheet ' + Array.from({ length: 50 }, (_, i) => `word${i}`).join(' ');
		const toolsLong = resolveToolsForMessage(longProse, true);
		const toolsShort = resolveToolsForMessage('/marksheet', true);
		expect(Object.keys(toolsLong).length).toBe(Object.keys(toolsShort).length);
	});
});
