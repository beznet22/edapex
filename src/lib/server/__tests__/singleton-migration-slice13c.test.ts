import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("$env/dynamic/private", () => ({
	env: {
		DATABASE_URL: "mysql://test:test@localhost:3306/test",
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
 * Slice 13c: complete the Slice 10 migration. Slice 10 migrated 10 callsites
 * of the module-level `assessment` singleton to `createAssessmentServiceForRequest`,
 * but left 4 callsites untouched:
 *   - src/routes/(chat)/+layout.server.ts (page server)
 *   - src/lib/api/chat.remote.ts (remote functions)
 *   - src/lib/server/mastra/workflows/publish.ts (workflow Step)
 *   - src/lib/server/service/auth.service.ts + src/lib/api/auth.remote.ts
 *
 * The first three are tenant-scoped and follow the per-request provider
 * pattern. The auth files are NOT tenant-scoped (auth is global session
 * data, established BEFORE the active TenantContext is known) so the
 * `authRepo` singleton is legitimate and KEPT — but a JSDoc block is added
 * to both files explaining why.
 *
 * These tests are static source-text audits: they fail CI if any of the
 * three tenant-scoped files re-imports the legacy singleton, and they
 * fail if the auth files drop the singleton import or the JSDoc block.
 */
describe("Slice 13c: complete the per-request provider migration", () => {
	const layoutSrc = readFileSync(
		join(process.cwd(), "src/routes/(chat)/+layout.server.ts"),
		"utf-8",
	);
	const chatRemoteSrc = readFileSync(
		join(process.cwd(), "src/lib/api/chat.remote.ts"),
		"utf-8",
	);
	const publishSrc = readFileSync(
		join(process.cwd(), "src/lib/server/mastra/workflows/publish.ts"),
		"utf-8",
	);
	const authServiceSrc = readFileSync(
		join(process.cwd(), "src/lib/server/service/auth.service.ts"),
		"utf-8",
	);
	const authRemoteSrc = readFileSync(
		join(process.cwd(), "src/lib/api/auth.remote.ts"),
		"utf-8",
	);

	describe("(chat)/+layout.server.ts — must use createAssessmentServiceForRequest", () => {
		it("does not import `base` from $lib/server/repository (unused singleton)", () => {
			expect(
				/import\s+\{\s*[^}]*\bbase\b[^}]*\}\s+from\s+['"]\$lib\/server\/repository['"]/.test(layoutSrc),
				"layout.server.ts still imports `base` from $lib/server/repository",
			).toBe(false);
		});

		it("does not import `repo` from $lib/server/repository (unused singleton)", () => {
			expect(
				/import\s+\{\s*[^}]*\brepo\b[^}]*\}\s+from\s+['"]\$lib\/server\/repository['"]/.test(layoutSrc),
				"layout.server.ts still imports `repo` from $lib/server/repository",
			).toBe(false);
		});

		it("does not import `studentRepo` or `resultRepo` from $lib/server/repository (must use service)", () => {
			expect(
				/import\s+\{\s*[^}]*\b(studentRepo|resultRepo)\b[^}]*\}\s+from\s+['"]\$lib\/server\/repository['"]/.test(
					layoutSrc,
				),
				"layout.server.ts still imports a tenant-scoped singleton from $lib/server/repository",
			).toBe(false);
		});

		it("uses createAssessmentServiceForRequest to build the per-request service", () => {
			expect(
				/createAssessmentServiceForRequest\s*\(/.test(layoutSrc),
				"layout.server.ts must use createAssessmentServiceForRequest",
			).toBe(true);
		});
	});

	describe("chat.remote.ts — must use createAssessmentServiceForRequest", () => {
		it("does not import staffRepo/resultRepo/studentRepo from $lib/server/repository (must use service)", () => {
			expect(
				/import\s+\{\s*[^}]*\b(staffRepo|resultRepo|studentRepo)\b[^}]*\}\s+from\s+['"]\$lib\/server\/repository['"]/.test(
					chatRemoteSrc,
				),
				"chat.remote.ts still imports a tenant-scoped singleton",
			).toBe(false);
		});

		it("uses createAssessmentServiceForRequest to build the per-request service", () => {
			expect(
				/createAssessmentServiceForRequest\s*\(/.test(chatRemoteSrc),
				"chat.remote.ts must use createAssessmentServiceForRequest",
			).toBe(true);
		});
	});

	describe("publish.ts workflow — must use createAssessmentServiceForRequest", () => {
		it("does not import studentRepo from $lib/server/repository (must use service in resolveTargetsStep)", () => {
			expect(
				/import\s+\{\s*[^}]*\bstudentRepo\b[^}]*\}\s+from\s+['"]\$lib\/server\/repository['"]/.test(
					publishSrc,
				),
				"publish.ts still imports `studentRepo` directly",
			).toBe(false);
		});

		it("uses createAssessmentServiceForRequest in resolveTargetsStep", () => {
			// The step body should build a service, not call the singleton.
			const stepIdx = publishSrc.indexOf("resolveTargetsStep");
			expect(stepIdx).toBeGreaterThan(-1);
			const nextStepIdx = publishSrc.indexOf("publishBatchStep", stepIdx);
			const stepBody = publishSrc.slice(stepIdx, nextStepIdx);
			expect(
				/createAssessmentServiceForRequest\s*\(/.test(stepBody),
				"resolveTargetsStep body must use createAssessmentServiceForRequest",
			).toBe(true);
		});
	});

	describe("auth.service.ts + auth.remote.ts — KEEP authRepo singleton (documented)", () => {
		it("auth.service.ts still imports authRepo (legitimate global-session singleton)", () => {
			expect(
				/import\s+\{\s*[^}]*\bauthRepo\b[^}]*\}\s+from\s+['"]\$lib\/server\/repository['"]/.test(
					authServiceSrc,
				),
				"auth.service.ts should keep importing authRepo",
			).toBe(true);
		});

		it("auth.service.ts has a JSDoc block explaining why authRepo is a singleton", () => {
			// The explanation must mention: session/global/pre-tenant/no tenant context.
			const matches = authServiceSrc.match(/\/\*\*[\s\S]*?\*\//g) || [];
			const hasExplanation = matches.some(
				(m) =>
					/authRepo/i.test(m) &&
					/(session|global|pre-tenant|tenant[- ]?scoped|tenant context|not\s*tenant|before\s*the\s*active)/i.test(
						m,
					),
			);
			expect(
				hasExplanation,
				"auth.service.ts should have a JSDoc block explaining why authRepo is a singleton",
			).toBe(true);
		});

		it("auth.remote.ts still imports authRepo (legitimate global-session singleton)", () => {
			expect(
				/import\s+\{\s*[^}]*\bauthRepo\b[^}]*\}\s+from\s+['"]\$lib\/server\/repository['"]/.test(
					authRemoteSrc,
				),
				"auth.remote.ts should keep importing authRepo",
			).toBe(true);
		});

		it("auth.remote.ts has a JSDoc block explaining why authRepo is a singleton", () => {
			const matches = authRemoteSrc.match(/\/\*\*[\s\S]*?\*\//g) || [];
			const hasExplanation = matches.some(
				(m) =>
					/authRepo/i.test(m) &&
					/(session|global|pre-tenant|tenant[- ]?scoped|tenant context|not\s*tenant|before\s*the\s*active)/i.test(
						m,
					),
			);
			expect(
				hasExplanation,
				"auth.remote.ts should have a JSDoc block explaining why authRepo is a singleton",
			).toBe(true);
		});
	});
});
