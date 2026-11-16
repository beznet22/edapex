import { z } from 'zod';
import { readFile, readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import matter from 'gray-matter';

/**
 * Reserved Global Tool IDs that skills MUST NOT declare.
 * These tools are always injected by the Gateway regardless of active skill.
 * Skills attempting to register tools with these IDs will be rejected during validation.
 */
export const RESERVED_GLOBAL_TOOL_IDS = new Set(['web-search', 'web-fetch']);

/**
 * Zod schema for `.skill.md` frontmatter (spec: mastra_migration_specs.md §2.2 L59-66).
 * Enforces non-empty name, description, and tools to prevent poisoned skills.
 */
export const SkillSchema = z.object({
	name: z.string().min(1),
	description: z.string().min(1),
	tools: z.array(z.string().min(1)).min(1),
	config: z
		.object({
			locked: z.boolean().default(false)
		})
		.default({ locked: false })
});

export type SkillFrontmatter = z.infer<typeof SkillSchema>;

export interface SkillDefinition extends SkillFrontmatter {
	instructions: string;
	slashCommand: string;
	filePath: string;
}

export interface ValidationResult {
	file: string;
	valid: boolean;
	errors: string[];
	skill?: SkillDefinition;
}

/**
 * Parse a single `.skill.md` file through the gray-matter + Zod pipeline.
 * The filename (minus `.skill.md`) becomes the slash command (spec L50).
 */
export async function parseSkillFile(filePath: string): Promise<SkillDefinition> {
	const raw = await readFile(filePath, 'utf-8');
	return parseSkillContent(raw, filePath);
}

/**
 * Parse a `.skill.md` payload from its raw string content.
 * Used by the bundled loader (import.meta.glob) so production
 * builds don't need filesystem access to /src/lib/server/mastra/skills.
 *
 * The `sourcePath` is used only for error messages and the
 * `filePath` field on the returned skill definition.
 */
export function parseSkillContent(raw: string, sourcePath: string): SkillDefinition {
	const { data, content } = matter(raw);
	const validated = SkillSchema.parse(data);

	const filename = basename(sourcePath, '.skill.md');

	return {
		...validated,
		instructions: content.trim(),
		slashCommand: `/${filename}`,
		filePath: sourcePath
	};
}

/**
 * CI-grade validation of an entire skill directory.
 * Checks Zod schema conformance, tool existence against the registry,
 * AND rejects skills that declare reserved Global Tool IDs (web-search, web-fetch).
 */
export async function validateSkillDirectory(
	dirPath: string,
	knownTools: Set<string>
): Promise<ValidationResult[]> {
	const files = await readdir(dirPath);
	const skillFiles = files.filter((f) => f.endsWith('.skill.md'));
	const entries: Array<{ filename: string; raw: string }> = [];
	for (const file of skillFiles) {
		const filePath = join(dirPath, file);
		entries.push({ filename: file, raw: await readFile(filePath, 'utf-8') });
	}
	return validateSkillEntries(entries, knownTools, dirPath);
}

/**
 * Validate a set of pre-loaded skill entries (raw content + filename).
 * The `basePath` is used as the `filePath` prefix for error messages and
 * the resulting SkillDefinition.filePath field. Pass an empty string for
 * virtual/glob-loaded skills where the path is informational only.
 */
export function validateSkillEntries(
	entries: Array<{ filename: string; raw: string }>,
	knownTools: Set<string>,
	basePath: string = ''
): ValidationResult[] {
	const results: ValidationResult[] = [];

	for (const { filename, raw } of entries) {
		const filePath = basePath ? join(basePath, filename) : filename;
		const result: ValidationResult = { file: filename, valid: true, errors: [] };

		try {
			const skill = parseSkillContent(raw, filePath);

			// Reject skills that declare reserved Global Tool IDs
			const conflictingTools = skill.tools.filter((t) => RESERVED_GLOBAL_TOOL_IDS.has(t));
			if (conflictingTools.length > 0) {
				result.valid = false;
				for (const tool of conflictingTools) {
					result.errors.push(
						`Tool "${tool}" in ${filename} conflicts with a reserved Global Tool — skills cannot declare Global Tool IDs`
					);
				}
			}

			const missingTools = skill.tools.filter((t) => !knownTools.has(t));
			if (missingTools.length > 0) {
				result.valid = false;
				for (const tool of missingTools) {
					result.errors.push(`Tool "${tool}" referenced in ${filename} does not exist in the registry`);
				}
			}

			if (result.valid) {
				result.skill = skill;
			}
		} catch (error: unknown) {
			result.valid = false;
			if (error instanceof z.ZodError) {
				for (const issue of error.issues) {
					result.errors.push(`${issue.path.join('.')}: ${issue.message}`);
				}
			} else {
				result.errors.push(error instanceof Error ? error.message : String(error));
			}
		}

		results.push(result);
	}

	return results;
}
