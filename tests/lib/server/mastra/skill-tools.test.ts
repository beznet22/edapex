import { describe, it, expect, beforeAll, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({
	env: {
		DATABASE_URL: "mysql://test:test@localhost:3306/test",
		LIBSQL_URL: "file:tests/.tmp/test.db",
		LIBSQL_AUTH_TOKEN: "test",
		TOKEN_ENCRYPTION_KEY: "test-encryption-key-32-chars-ok!",
		TINYFISH_API_KEY: "test-key",
		DEEPSEEK_API_KEY: "test-key",
	},
}));

vi.mock("$app/server", () => ({
	getRequestEvent: () => null,
}));

import {
	resolveToolsForMessage,
	TOOL_MAP,
	skillRegistry
} from "$lib/server/mastra/skill-tools";
import type { SkillManifest } from "$lib/server/mastra/skill-registry";
import type { SkillDefinition } from "$lib/server/mastra/skill-schema";

function buildSkill(
	name: string,
	description: string,
	tools: readonly string[]
): SkillDefinition {
	return {
		name,
		description,
		tools: [...tools],
		config: { locked: false },
		instructions: `Test instructions for ${name}`,
		slashCommand: `/${name.toLowerCase()}`,
		filePath: `/fake/${name.toLowerCase()}.skill.md`
	};
}

const ACADEMIC_TOOLS = ["manage-academic-records"] as const;
const WRITE_TOOLS = [
	"update-student-biodata",
	"update-staff-biodata",
	"enroll-student",
	"transfer-student",
	"enroll-staff",
	"assign-staff-to-class",
	"assign-staff-to-subject",
	"teacher-self-assign-class",
	"promote-student",
	"demote-student"
] as const;
const DESTRUCTIVE_TOOLS = ["manage-account-access"] as const;
const REPORTING_TOOLS = [
	"get-active-marksheet",
	"format-marksheet-document",
	"validate-marksheet",
	"auto-fix-marksheet",
	"commit-marksheet",
	"generate-result-pdf",
	"publish-result-pdf",
	"request-selection",
	"choose-document"
] as const;
const DEFAULT_TOOLS = [
	"search-school-directory",
	"get-academic-context",
	"switch-academic-context"
] as const;
const ASSISTANT_TOOLS = ["search-school-directory", "get-academic-context"] as const;
const READ_TOOLS = [
	"search-school-directory",
	"get-academic-context",
	"list-master-data",
	"view-student-result"
] as const;
const PARENT_TOOLS = [
	"list-my-children",
	"view-child-result",
	"download-child-pdf",
	"child-attendance",
	"child-ranking",
	"child-performance-trend",
	"view-child-timetable",
	"view-child-homework",
	"view-child-exam-schedule",
	"view-child-fees",
	"view-notice-board",
	"view-school-events",
	"view-holidays",
	"search-school-directory",
	"get-academic-context"
] as const;

const ALL_SKILLS: Record<string, SkillDefinition> = {
	default: buildSkill("Default", "Fallback skill for orientation and context switching", DEFAULT_TOOLS),
	assistant: buildSkill("Assistant", "Conversational partner for teachers and admins", ASSISTANT_TOOLS),
	read: buildSkill("Read", "Read-only inspection of school data", READ_TOOLS),
	write: buildSkill("Write", "Create or update school records", WRITE_TOOLS),
	academic: buildSkill("Academic", "Record and edit marks, attendance, and teacher remarks", ACADEMIC_TOOLS),
	destructive: buildSkill("Destructive", "High-risk account operations", DESTRUCTIVE_TOOLS),
	reporting: buildSkill("Reporting", "Marksheet ingestion, validation, and publication", REPORTING_TOOLS),
	parent: buildSkill("parent", "Read-only concierge for parents on Telegram", PARENT_TOOLS)
};

// Some skill files reference tool IDs that are not yet exported by the
// tools barrel at module-load time (e.g. manage-academic-records, the full
// reporting pipeline, choose-document, update-student-biodata). Without
// these entries, validateSkillDirectory would reject the academic / write /
// reporting skills and the slash-command map would fall through to the
// "all-tools" branch. Inject stubs so the operation-group resolution can be
// exercised end-to-end without modifying the production source.
const MISSING_TOOL_IDS = [
	"manage-academic-records",
	"update-student-biodata",
	"get-active-marksheet",
	"format-marksheet-document",
	"validate-marksheet",
	"auto-fix-marksheet",
	"commit-marksheet",
	"generate-result-pdf",
	"publish-result-pdf",
	"choose-document"
] as const;

beforeAll(() => {
	for (const toolId of MISSING_TOOL_IDS) {
		TOOL_MAP[toolId] = { id: toolId };
	}

	const manifest: SkillManifest = {
		version: 1,
		generatedAt: new Date().toISOString(),
		skills: ALL_SKILLS,
		errors: []
	};
	skillRegistry.loadFromManifest(manifest);
});

function resolveToolKeys(message: string, isSlashCommand: boolean): Set<string> {
	const result = resolveToolsForMessage(message, isSlashCommand);
	return new Set(Object.keys(result));
}

describe("Phase 7.2 — skill-tools operation-group resolution", () => {
	it("Test 1: non-slash message always includes globalTools (web-search, web-fetch)", () => {
		const keys = resolveToolKeys("hello world", false);
		expect(keys.has("web-search")).toBe(true);
		expect(keys.has("web-fetch")).toBe(true);
	});

	it("Test 2: /grade slash command resolves to the academic skill and injects manage-academic-records", () => {
		const keys = resolveToolKeys("/grade", true);
		expect(keys.has("manage-academic-records")).toBe(true);
	});

	it("Test 3: /enroll slash command resolves to the write skill and injects enroll-student, transfer-student, etc.", () => {
		const keys = resolveToolKeys("/enroll", true);
		expect(keys.has("enroll-student")).toBe(true);
		expect(keys.has("transfer-student")).toBe(true);
	});

	it("Test 4: /suspend slash command resolves to the destructive skill and injects manage-account-access", () => {
		const keys = resolveToolKeys("/suspend", true);
		expect(keys.has("manage-account-access")).toBe(true);
	});

	it("Test 5: /extract slash command resolves to the reporting skill and injects get-active-marksheet", () => {
		const keys = resolveToolKeys("/extract", true);
		expect(keys.has("get-active-marksheet")).toBe(true);
	});

	it("Test 6: /search slash command resolves to the default skill and injects the default toolset", () => {
		const keys = resolveToolKeys("/search", true);
		expect(keys.has("search-school-directory")).toBe(true);
		expect(keys.has("get-academic-context")).toBe(true);
		expect(keys.has("switch-academic-context")).toBe(true);
	});
});
