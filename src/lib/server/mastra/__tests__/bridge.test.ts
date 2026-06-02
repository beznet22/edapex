import { describe, it, expect, vi } from "vitest";

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

const { dbStub } = vi.hoisted(() => ({
	dbStub: { __isDbStub: true },
}));

vi.mock("$lib/server/db", () => ({
	getDatabase: vi.fn().mockResolvedValue(dbStub),
}));

import { RequestContext } from "@mastra/core/request-context";
import {
	buildMastraToolContext,
	createTenantContext,
} from "../tenant-context";
import { ScopedRepositoryProvider } from "../scoped-repository";

class StubRepo {
	constructor(
		public readonly db: unknown,
		public readonly tenantCtx: unknown,
	) {}
}

class StubService {
	constructor(public readonly provider: ScopedRepositoryProvider) {}
}

describe("Slice 0 — buildMastraToolContext bridge", () => {
	it("returns a locked default context when the request context is missing", async () => {
		const mctx = await buildMastraToolContext(undefined);

		expect(mctx.tenantContext.schoolId).toBe(1);
		expect(mctx.tenantContext.userId).toBe(1);
		expect(mctx.tenantContext.staffId).toBe(1);
		expect(mctx.tenantContext.designationId).toBe(1);
		expect(mctx.tenantContext.classId).toBeNull();
		expect(mctx.tenantContext.sectionId).toBeNull();
		expect(mctx.tenantContext.examId).toBeNull();
		expect(mctx.tenantContext.academicId).toBeNull();
		expect(mctx.tenantContext.studentId).toBeNull();
		expect(mctx.tenantContext.roleId).toBeNull();
		expect(mctx.audit).toEqual({});

		expect(() => mctx.getRepo(StubRepo)).toThrow(/without a request context/);
		expect(() => mctx.getService(StubService)).toThrow(/without a request context/);
	});

	it("propagates the tenant and audit metadata from a populated request context", async () => {
		const tenant = createTenantContext({
			schoolId: 42,
			userId: 7,
			staffId: 99,
			designationId: 8,
			classId: 3,
			sectionId: 1,
			examId: 5,
			academicId: 2026,
			roleId: 2,
		});
		const rc = new RequestContext();
		rc.set("tenantContext", tenant);
		rc.set("threadId", "thr_abc");
		rc.set("modelId", "edapex/openai/gpt-4o");

		const mctx = await buildMastraToolContext(rc);

		expect(mctx.tenantContext).toBe(tenant);
		expect(mctx.tenantContext.schoolId).toBe(42);
		expect(mctx.tenantContext.classId).toBe(3);
		expect(mctx.audit).toEqual({
			threadId: "thr_abc",
			modelId: "edapex/openai/gpt-4o",
		});
	});

	it("returns undefined audit fields when the request context omits them", async () => {
		const tenant = createTenantContext({ schoolId: 2, userId: 11, staffId: 22, designationId: 8 });
		const rc = new RequestContext();
		rc.set("tenantContext", tenant);

		const mctx = await buildMastraToolContext(rc);

		expect(mctx.tenantContext).toBe(tenant);
		expect(mctx.audit).toEqual({ threadId: undefined, modelId: undefined });
	});

	it("falls back to the default tenant when the request context has no tenantContext key", async () => {
		const rc = new RequestContext();
		rc.set("modelId", "edapex/openai/gpt-4o");

		const mctx = await buildMastraToolContext(rc);

		expect(mctx.tenantContext.schoolId).toBe(1);
		expect(mctx.audit?.modelId).toBe("edapex/openai/gpt-4o");
	});

	it("getService returns an instance constructed with a tenant-bound provider", async () => {
		const tenant = createTenantContext({
			schoolId: 2,
			userId: 11,
			staffId: 22,
			designationId: 8,
		});
		const rc = new RequestContext();
		rc.set("tenantContext", tenant);

		const mctx = await buildMastraToolContext(rc);
		const svc = mctx.getService(StubService);

		expect(svc).toBeInstanceOf(StubService);
		expect(svc.provider).toBeInstanceOf(ScopedRepositoryProvider);
		expect(svc.provider.getTenant()).toBe(tenant);
		expect(svc.provider.getDb()).toBe(dbStub);
	});

	it("getService returns the same cached instance on repeated calls", async () => {
		const tenant = createTenantContext({ schoolId: 4, userId: 1, staffId: 1, designationId: 1 });
		const rc = new RequestContext();
		rc.set("tenantContext", tenant);

		const mctx = await buildMastraToolContext(rc);
		const first = mctx.getService(StubService);
		const second = mctx.getService(StubService);

		expect(first).toBe(second);
	});

	it("getRepo returns an instance bound to (db, tenant)", async () => {
		const tenant = createTenantContext({
			schoolId: 3,
			userId: 1,
			staffId: 1,
			designationId: 1,
		});
		const rc = new RequestContext();
		rc.set("tenantContext", tenant);

		const mctx = await buildMastraToolContext(rc);
		const repo = mctx.getRepo(StubRepo);

		expect(repo).toBeInstanceOf(StubRepo);
		expect(repo.db).toBe(dbStub);
		expect(repo.tenantCtx).toBe(tenant);
	});

	it("getRepo returns the same cached instance on repeated calls with the same class", async () => {
		const tenant = createTenantContext({ schoolId: 5, userId: 1, staffId: 1, designationId: 1 });
		const rc = new RequestContext();
		rc.set("tenantContext", tenant);

		const mctx = await buildMastraToolContext(rc);
		const first = mctx.getRepo(StubRepo);
		const second = mctx.getRepo(StubRepo);

		expect(first).toBe(second);
	});

	it("two bridges with different tenants produce isolated providers", async () => {
		const tenantA = createTenantContext({ schoolId: 1, userId: 1, staffId: 1, designationId: 1 });
		const tenantB = createTenantContext({ schoolId: 2, userId: 2, staffId: 2, designationId: 1 });

		const rcA = new RequestContext();
		rcA.set("tenantContext", tenantA);
		const rcB = new RequestContext();
		rcB.set("tenantContext", tenantB);

		const mctxA = await buildMastraToolContext(rcA);
		const mctxB = await buildMastraToolContext(rcB);

		const svcA = mctxA.getService(StubService);
		const svcB = mctxB.getService(StubService);

		expect(svcA.provider.getTenant()).toBe(tenantA);
		expect(svcB.provider.getTenant()).toBe(tenantB);
		expect(svcA.provider).not.toBe(svcB.provider);
	});

	describe("Slice 2 additions — getProvider + mastra plumbing", () => {
		it("exposes getProvider on the bridged context (used by *Logic functions)", async () => {
			const tenant = createTenantContext({ schoolId: 7, userId: 1, staffId: 1, designationId: 1 });
			const rc = new RequestContext();
			rc.set("tenantContext", tenant);

			const mctx = await buildMastraToolContext(rc);

			expect(mctx.getProvider).toBeDefined();
			const provider = mctx.getProvider!();
			expect(provider).toBeInstanceOf(ScopedRepositoryProvider);
			expect(provider.getTenant()).toBe(tenant);
		});

		it("forwards the optional mastra reference", async () => {
			const tenant = createTenantContext({ schoolId: 8, userId: 1, staffId: 1, designationId: 1 });
			const rc = new RequestContext();
			rc.set("tenantContext", tenant);

			const mockMastra = { id: "fake-mastra-instance" };
			const mctx = await buildMastraToolContext(rc, mockMastra);

			expect(mctx.mastra).toBe(mockMastra);
		});

		it("mastra is undefined when omitted", async () => {
			const tenant = createTenantContext({ schoolId: 9, userId: 1, staffId: 1, designationId: 1 });
			const rc = new RequestContext();
			rc.set("tenantContext", tenant);

			const mctx = await buildMastraToolContext(rc);

			expect(mctx.mastra).toBeUndefined();
		});

		it("getProvider is undefined on the locked default context (no provider reachable)", async () => {
			const mctx = await buildMastraToolContext(undefined);
			expect(mctx.getProvider).toBeUndefined();
		});
	});
});
