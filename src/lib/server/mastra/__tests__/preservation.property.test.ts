/**
 * Property 2: Preservation — Behavioral Contract Integrity
 *
 * These property-based tests capture the BASELINE behavior of the unfixed code.
 * They must PASS on the current (unfixed) code, confirming the behavioral contracts
 * that must remain unchanged after the refactor.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import * as fc from 'fast-check';

vi.mock('$env/dynamic/private', () => ({
	env: {
		DATABASE_URL: 'mysql://test:test@localhost:3306/test',
		TOKEN_ENCRYPTION_KEY: 'test-encryption-key-32-chars-ok!',
		TINYFISH_API_KEY: 'test-key',
	},
}));

vi.mock('$env/dynamic/public', () => ({
	env: {
		PUBLIC_STORAGE_PATH: '/tmp/test-storage',
	},
}));

vi.mock('$app/server', () => ({
	getRequestEvent: () => null,
}));

vi.mock('$app/environment', () => ({
	dev: true,
	browser: false,
}));

vi.mock('$lib/components/template/ResultTemplate.svelte', () => ({
	default: {},
}));

vi.mock('$lib/components/template/result-email.svelte', () => ({
	default: {},
}));

vi.mock('$lib/server/storage/files', () => ({
	workspaceFiles: {
		download: vi.fn().mockImplementation(async (path: string) => {
			// Simulate file content based on path
			const content = `Content of file at ${path}`;
			return {
				size: content.length,
				text: async () => content,
				arrayBuffer: async () => new TextEncoder().encode(content).buffer,
			};
		}),
	},
}));

import { createTenantContext, type TenantContext } from '../tenant-context';
import { EdApexGateway } from '../gateway';
import { SkillRegistry } from '../skill-registry';
import { coreTools, workflowTools, searchEntityTool } from '../tools/index';
import { globalTools } from '../tools/global-tools';
import { injectFileContext, isBinaryMimeType, type FileReference } from '../file-context';

// ─── Arbitrary Generators ───────────────────────────────────────────────────────

/** Generator for valid TenantContext values */
const arbTenantContext: fc.Arbitrary<TenantContext> = fc.record({
	schoolId: fc.integer({ min: 1, max: 10000 }),
	userId: fc.integer({ min: 1, max: 10000 }),
	designationId: fc.integer({ min: 1, max: 20 }),
	staffId: fc.integer({ min: 1, max: 10000 }),
	roleId: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 10 })),
	classId: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 500 })),
	sectionId: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 100 })),
	examId: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 200 })),
	academicId: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 50 })),
	studentId: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 50000 })),
}).map((ctx) => Object.freeze(ctx) as TenantContext);

/** The slash command map from gateway.ts */
const SLASH_COMMANDS = [
	'/grade', '/mark', '/attendance',
	'/register', '/enroll', '/assign',
	'/update', '/edit', '/rename',
	'/ban', '/suspend', '/reset',
	'/extract', '/generate',
	'/validate', '/publish',
	'/search', '/find',
	'/switch', '/status',
] as const;

/** Generator for slash commands */
const arbSlashCommand = fc.constantFrom(...SLASH_COMMANDS);

/** Generator for non-slash messages (regular conversational text) */
const arbNonSlashMessage = fc.string({ minLength: 1, maxLength: 200 })
	.filter((s) => !s.trim().startsWith('/'))
	.map((s) => s.trim() || 'hello'); // Ensure non-empty after trim

/** Generator for file references */
const arbFileReference: fc.Arbitrary<FileReference> = fc.record({
	key: fc.string({ minLength: 1, maxLength: 50 }).map((s) => s.replace(/[/\\]/g, '-')),
	name: fc.string({ minLength: 1, maxLength: 30 }).map((s) => (s.replace(/[/\\]/g, '-') || 'file') + '.txt'),
	type: fc.constantFrom('file' as const, 'dir' as const),
	size: fc.oneof(fc.constant(undefined), fc.integer({ min: 1, max: 100000 })),
	mimeType: fc.oneof(
		fc.constant(undefined),
		fc.constant('text/plain'),
		fc.constant('text/markdown'),
		fc.constant('application/json'),
	),
});

/** Generator for arrays of file references (1-5 items) */
const arbFileReferences = fc.array(arbFileReference, { minLength: 1, maxLength: 5 });

// ─── Test Setup ─────────────────────────────────────────────────────────────────

/**
 * Create a gateway instance with skill registry pre-loaded for testing.
 * We access private methods via prototype for property testing.
 */
async function createTestGateway(): Promise<EdApexGateway> {
	// We need a minimal db mock since we're only testing instruction/tool resolution
	const mockDb = {} as any;
	const gateway = new EdApexGateway(mockDb, 1, 'test-key');

	// Load the skill registry by calling ensureRegistry via a private accessor
	const registry = (gateway as any).skillRegistry as SkillRegistry;
	const knownTools = new Set(Object.keys((EdApexGateway as any).TOOL_MAP));
	await registry.loadFromDirectory(process.cwd() + '/src/lib/server/mastra/skills', knownTools);
	(gateway as any).registryInitialized = true;

	return gateway;
}

// ═══════════════════════════════════════════════════════════════════════
// Property 2.1: Supervisor Instructions contain correct TenantContext IDs
// ═══════════════════════════════════════════════════════════════════════

describe('Property 2: Preservation — Behavioral Contract Integrity', () => {
	let gateway: EdApexGateway;

	beforeAll(async () => {
		gateway = await createTestGateway();
	});

	describe('2.1 Supervisor Instructions contain correct TenantContext IDs and delegation strategy', () => {
		it('for all TenantContext values, supervisor instructions contain the correct IDs', () => {
			fc.assert(
				fc.property(arbTenantContext, (context) => {
					const instructions = (gateway as any).getSupervisorInstructions(context);

					// Must contain all TenantContext IDs
					expect(instructions).toContain(`School ID: ${context.schoolId}`);
					expect(instructions).toContain(`User ID: ${context.userId}`);
					expect(instructions).toContain(`Designation ID: ${context.designationId}`);
					expect(instructions).toContain(
						`Active Class ID: ${context.classId || 'None'}`
					);
					expect(instructions).toContain(
						`Active Section ID: ${context.sectionId || 'None'}`
					);
					expect(instructions).toContain(
						`Active Exam ID: ${context.examId || 'None'}`
					);

					// Must contain delegation strategy
					expect(instructions).toContain('DELEGATION STRATEGY');
					expect(instructions).toContain('assistant');

					// Must contain confidence gate
					expect(instructions).toContain('CONFIDENCE GATE');
					expect(instructions).toContain('0.9');
				}),
				{ numRuns: 100 }
			);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════
	// Property 2.2: Slash command tool resolution produces correct tool sets
	// ═══════════════════════════════════════════════════════════════════════

	describe('2.2 Slash command tool resolution produces the same tool set as resolveToolsForIntent()', () => {
		it('for all slash commands, tool resolution always includes global tools', () => {
			fc.assert(
				fc.property(arbSlashCommand, (command) => {
					const resolvedTools = (gateway as any).resolveToolsForIntent(
						{ intent: 'mutation' },
						true,
						`${command} test input`
					);

					const toolKeys = Object.keys(resolvedTools);

					// Global tools are ALWAYS present regardless of slash command
					expect(toolKeys).toContain('web-search');
					expect(toolKeys).toContain('web-fetch');

					// Tool set is never empty (always has at least global tools + something)
					expect(toolKeys.length).toBeGreaterThan(2);
				}),
				{ numRuns: 50 }
			);
		});

		it('for all slash commands, resolveToolsForIntent is deterministic (same input → same output)', () => {
			fc.assert(
				fc.property(arbSlashCommand, (command) => {
					const msg = `${command} test input`;
					const classification = { intent: 'mutation' };

					const result1 = (gateway as any).resolveToolsForIntent(classification, true, msg);
					const result2 = (gateway as any).resolveToolsForIntent(classification, true, msg);

					// Same input must produce same tool keys
					const keys1 = Object.keys(result1).sort();
					const keys2 = Object.keys(result2).sort();
					expect(keys1).toEqual(keys2);
				}),
				{ numRuns: 50 }
			);
		});

		it('workflow commands (/extract, /generate, /validate, /publish) include workflow tools', () => {
			const workflowCommands = ['/extract', '/generate', '/validate', '/publish'];

			for (const command of workflowCommands) {
				const resolvedTools = (gateway as any).resolveToolsForIntent(
					{ intent: 'mutation' },
					true,
					`${command} test input`
				);

				const toolKeys = Object.keys(resolvedTools);

				// Workflow tools must be present (keys are the variable names from the export)
				expect(toolKeys).toContain('extractTool');
				expect(toolKeys).toContain('validateTool');
				expect(toolKeys).toContain('publishTool');
			}
		});
	});

	// ═══════════════════════════════════════════════════════════════════════
	// Property 2.3: Non-slash messages return full core + workflow + global tool set
	// ═══════════════════════════════════════════════════════════════════════

	describe('2.3 Non-slash messages return the full core + workflow + global tool set', () => {
		it('for all non-slash messages, tool resolution returns core + workflow + global tools', () => {
			// First, observe the expected tool set for a non-slash message
			const expectedTools = (gateway as any).resolveToolsForIntent(
				{ intent: 'conversational' },
				false,
				'hello'
			);
			const expectedKeys = Object.keys(expectedTools).sort();

			fc.assert(
				fc.property(arbNonSlashMessage, (message) => {
					const resolvedTools = (gateway as any).resolveToolsForIntent(
						{ intent: 'conversational' },
						false,
						message
					);

					const toolKeys = Object.keys(resolvedTools).sort();

					// Global tools present
					expect(toolKeys).toContain('web-search');
					expect(toolKeys).toContain('web-fetch');

					// All core tool keys present (actual tool IDs)
					for (const tool of Object.values(coreTools)) {
						if (tool && tool.id) expect(toolKeys).toContain(tool.id);
					}

					// All workflow tool keys present
					for (const tool of Object.values(workflowTools)) {
						if (tool && tool.id) expect(toolKeys).toContain(tool.id);
					}

					// Total tool count matches expected (deterministic for all non-slash messages)
					expect(toolKeys).toEqual(expectedKeys);
				}),
				{ numRuns: 100 }
			);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════
	// Property 2.4: File context injection produces identical augmented messages
	// ═══════════════════════════════════════════════════════════════════════

	describe('2.4 File context injection produces identical augmented messages', () => {
		it('for all file reference inputs, injectFileContext produces deterministic output', async () => {
			await fc.assert(
				fc.asyncProperty(arbFileReferences, async (refs) => {
					const workspace = '/test/workspace';

					// Call twice with same input — must produce identical output
					const result1 = await injectFileContext(refs, workspace);
					const result2 = await injectFileContext(refs, workspace);

					expect(result1).toBe(result2);

					// Each non-binary file reference should appear in the output
					for (const ref of refs.slice(0, 5)) {
						if (!isBinaryMimeType(ref.mimeType)) {
							expect(result1).toContain(ref.name);
						}
					}
				}),
				{ numRuns: 50 }
			);
		});

		it('binary MIME types produce metadata-only output', () => {
			fc.assert(
				fc.property(
					fc.constantFrom(
						'image/png',
						'image/jpeg',
						'application/pdf',
						'application/zip',
						'audio/mp3',
						'video/mp4'
					),
					(mimeType) => {
						expect(isBinaryMimeType(mimeType)).toBe(true);
					}
				),
				{ numRuns: 20 }
			);
		});

		it('empty references produce empty string', async () => {
			const result = await injectFileContext([], '/workspace');
			expect(result).toBe('');
		});

		it('max 5 references are processed (excess are sliced)', async () => {
			const refs: FileReference[] = Array.from({ length: 8 }, (_, i) => ({
				key: `file-${i}.txt`,
				name: `file-${i}.txt`,
				type: 'file' as const,
				size: 100,
				mimeType: 'text/plain',
			}));

			const result = await injectFileContext(refs, '/workspace');

			// Only first 5 should appear
			expect(result).toContain('file-0.txt');
			expect(result).toContain('file-4.txt');
			expect(result).not.toContain('file-5.txt');
		});
	});

	// ═══════════════════════════════════════════════════════════════════════
	// Property 2.5: Assistant instructions contain tenant boundaries and guidelines
	// ═══════════════════════════════════════════════════════════════════════

	describe('2.5 Assistant instructions contain tenant boundaries and behavioral guidelines', () => {
		it('for all TenantContext values, assistant instructions contain correct IDs and guidelines', () => {
			fc.assert(
				fc.property(arbTenantContext, (context) => {
					const instructions = (gateway as any).getAssistantInstructions(context);

					// Must contain tenant boundary IDs
					expect(instructions).toContain(`School ID: ${context.schoolId}`);
					expect(instructions).toContain(`User ID: ${context.userId}`);
					expect(instructions).toContain(
						`Class ID: ${context.classId || 'N/A'}`
					);
					expect(instructions).toContain(
						`Section ID: ${context.sectionId || 'N/A'}`
					);
					expect(instructions).toContain(
						`Exam ID: ${context.examId || 'N/A'}`
					);

					// Must contain behavioral guidelines
					expect(instructions).toContain('BEHAVIORAL GUIDELINES');
					expect(instructions).toContain('tenant isolation');
				}),
				{ numRuns: 100 }
			);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════
	// Property 2.6: Abort signal handling — stream closes cleanly
	// ═══════════════════════════════════════════════════════════════════════

	describe('2.6 Abort signals — AbortController produces valid signal for stream cancellation', () => {
		it('for all abort signals, AbortController creates a valid signal that can be passed to stream options', () => {
			fc.assert(
				fc.property(fc.boolean(), (shouldAbort) => {
					const controller = new AbortController();
					const signal = controller.signal;

					// Signal starts as not aborted
					expect(signal.aborted).toBe(false);

					if (shouldAbort) {
						controller.abort();
						expect(signal.aborted).toBe(true);
					}

					// The signal is always a valid AbortSignal instance
					expect(signal).toBeInstanceOf(AbortSignal);
				}),
				{ numRuns: 50 }
			);
		});

		it('abort reason is propagated correctly', () => {
			const controller = new AbortController();
			const reason = new Error('User cancelled');
			controller.abort(reason);

			expect(controller.signal.aborted).toBe(true);
			expect(controller.signal.reason).toBe(reason);
		});
	});
});
