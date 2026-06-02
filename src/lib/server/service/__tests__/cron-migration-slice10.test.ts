import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

vi.mock("$env/dynamic/private", () => ({
	env: {
		DATABASE_URL: "mysql://test@localhost:3306/test",
		LIBSQL_URL: "file:test.db",
		LIBSQL_AUTH_TOKEN: "test",
	},
}));

vi.mock("$app/server", () => ({
	getRequestEvent: () => ({}),
}));

vi.mock("$app/environment", () => ({
	dev: true,
	browser: false,
}));

/**
 * Slice 10: drop the globalFallback path.
 *
 * Before Slice 10, AssessmentService's protected accessors
 * (student/result/timeline/staff) would silently fall back to the
 * module-level studentRepo/resultRepo/timelineRepo/staffRepo singletons
 * when no ScopedRepositoryProvider was supplied. This was a multi-tenant
 * safety hazard: every singleton is bound to the first TenantContext it
 * saw at module load time, so writes from a request for school 2 would
 * land in school 1.
 *
 * Slice 10: provider is required, the singleton is removed, and every
 * legacy callsite (5 API routes, 1 page server, 1 remote file, 3
 * workflow Steps) is migrated to construct a per-request service.
 */

const API_ROUTES = [
	"src/routes/api/results/+server.ts",
	"src/routes/api/+server.ts",
	"src/routes/api/uploads/+server.ts",
	"src/routes/api/uploads/[...fileId]/approve/+server.ts",
	"src/routes/api/results/[token]/+server.ts",
];

const WORKFLOW_STEPS = [
	"src/lib/server/mastra/workflows/generate.ts",
	"src/lib/server/mastra/workflows/validation.ts",
	"src/lib/server/mastra/workflows/publish.ts",
];

const PAGE_SERVERS = ["src/routes/(chat)/+page.server.ts"];

const REMOTE_FILES = ["src/lib/api/assessment.remote.ts"];

function readFile(relativePath: string): string {
	return readFileSync(join(process.cwd(), relativePath), "utf-8");
}

describe("Slice 10: globalFallback removal", () => {
	describe("AssessmentService provider is required", () => {
		it("the globalFallback branches in student/result/timeline/staff are gone", () => {
			const source = readFile(
				"src/lib/server/service/assessment.service.ts",
			);
			// The old code: `if (this.provider) return ...; return studentRepo;`
			// The new code: only `if (this.provider) return ...;` followed by a throw.
			// Specifically, the lines `return studentRepo;`, `return resultRepo;`,
			// `return timelineRepo;`, `return staffRepo;` should be GONE from the
			// service (these were the legacy-singleton fallbacks).
			expect(source).not.toMatch(/^\s*return\s+studentRepo\s*;\s*$/m);
			expect(source).not.toMatch(/^\s*return\s+resultRepo\s*;\s*$/m);
			expect(source).not.toMatch(/^\s*return\s+timelineRepo\s*;\s*$/m);
			expect(source).not.toMatch(/^\s*return\s+staffRepo\s*;\s*$/m);
		});

		it("AssessmentService no longer imports the legacy singletons", () => {
			const source = readFile(
				"src/lib/server/service/assessment.service.ts",
			);
			// The old import line bundled all four singletons in one destructured
			// import. After Slice 10 only the classes are needed (for getRepo).
			expect(source).not.toMatch(/import\s*\{[^}]*\bstudentRepo\b[^}]*\}\s*from/);
			expect(source).not.toMatch(/import\s*\{[^}]*\bresultRepo\b[^}]*\}\s*from/);
			expect(source).not.toMatch(/import\s*\{[^}]*\btimelineRepo\b[^}]*\}\s*from/);
			expect(source).not.toMatch(/import\s*\{[^}]*\bstaffRepo\b[^}]*\}\s*from/);
		});

		it("module-level `export const assessment = new AssessmentService()` is removed", () => {
			const source = readFile(
				"src/lib/server/service/assessment.service.ts",
			);
			expect(source).not.toMatch(/export\s+const\s+assessment\s*=\s*new\s+AssessmentService\s*\(\s*\)/);
		});
	});

	describe("API routes migrate off the global singleton", () => {
		for (const route of API_ROUTES) {
			it(`${route} no longer imports { assessment } from the service module`, () => {
				const source = readFile(route);
				expect(source).not.toMatch(/import\s*\{[^}]*\bassessment\b[^}]*\}\s*from\s*["']\$lib\/server\/service\/assessment\.service["']/);
			});
		}
	});

	describe("Workflow Steps construct a per-request AssessmentService", () => {
		for (const step of WORKFLOW_STEPS) {
			it(`${step} no longer imports the global assessment singleton`, () => {
				const source = readFile(step);
				expect(source).not.toMatch(/import\s*\{[^}]*\bassessment\b[^}]*\}\s*from\s*["'][^"']*assessment\.service["']/);
			});
		}
	});

	describe("Page server and remote functions migrate off the global singleton", () => {
		for (const path of [...PAGE_SERVERS, ...REMOTE_FILES]) {
			it(`${path} no longer imports the global assessment singleton`, () => {
				const source = readFile(path);
				expect(source).not.toMatch(/import\s*\{[^}]*\bassessment\b[^}]*\}\s*from\s*["'][^"']*assessment\.service["']/);
			});
		}
	});

	describe("createAssessmentServiceForRequest helper", () => {
		it("the helper is exported from assessment.service.ts", async () => {
			const source = readFile(
				"src/lib/server/service/assessment.service.ts",
			);
			expect(source).toMatch(/export\s+(?:async\s+)?function\s+createAssessmentServiceForRequest\s*\(/);
		});
	});
});
