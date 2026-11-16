import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("$lib/server/audit-log", () => ({
	log: vi.fn(async () => {}),
	readRecent: vi.fn(async () => [])
}));

vi.mock("$lib/server/mastra/provider/discovery", () => ({
	getDiscoveredModelsForUser: vi.fn(async () => []),
	getAllDiscoveredModelsForUser: vi.fn(async () => new Map()),
	getCachedPlatformProviderModels: vi.fn(async () => [])
}));

vi.mock("$lib/server/mastra/provider/visibility", () => ({
	getHiddenModelIdsForUser: vi.fn(async () => new Set<string>()),
	getEnabledModelIdsForUser: vi.fn(async () => new Set<string>())
}));

import { and, eq } from "drizzle-orm";
import { getAppDb } from "$lib/server/mastra/storage/libsql/app-db";
import {
	encryptedCredentials,
	providerAccessPolicy
} from "$lib/server/mastra/storage/libsql/app-db.schema";
import {
	disableModelOrProvider,
	enableModelOrProvider,
	listAdminOverrides
} from "$lib/server/mastra/provider/admin-model-overrides";
import { getAvailableModelsForUser } from "$lib/server/mastra/provider/availability";
import { BUILTIN_MODELS } from "$lib/provider/catalog";

const SCHOOL = 99996;
const USER_ID = 99001;

async function cleanup(): Promise<void> {
	const db = getAppDb();
	await db.delete(providerAccessPolicy).where(eq(providerAccessPolicy.schoolId, SCHOOL));
	await db
		.delete(encryptedCredentials)
		.where(and(eq(encryptedCredentials.scope, "user"), eq(encryptedCredentials.userId, USER_ID)));
}

async function seedPersonalCredential(): Promise<void> {
	const db = getAppDb();
	await db.insert(encryptedCredentials).values({
		scope: "user",
		credentialKind: "personal",
		userId: USER_ID,
		schoolId: null,
		providerId: "groq",
		encryptedData: JSON.stringify({ apiKey: "sk-test-roundtrip" }),
		priority: 1,
		enabled: 1
	});
}

describe("admin disables groq/llama-3.3-70b → next availableModels excludes it", () => {
	beforeEach(async () => {
		await cleanup();
	});

	it("disabling the specific model filters it from availableModels", async () => {
		const db = getAppDb();

		await seedPersonalCredential();

		const beforeDisable = await getAvailableModelsForUser(db, {}, USER_ID, SCHOOL);
		const groqBefore = beforeDisable.filter((m) => m.providerId === "groq");
		expect(groqBefore.length).toBeGreaterThan(0);
		const targetId = "groq/llama-3.3-70b-versatile";
		expect(groqBefore.find((m) => m.id === targetId)).toBeDefined();
		const otherGroq = groqBefore.find((m) => m.id !== targetId);
		expect(otherGroq).toBeDefined();

		await disableModelOrProvider(db, SCHOOL, "groq", targetId, 17, "cost limit");

		const afterDisable = await getAvailableModelsForUser(db, {}, USER_ID, SCHOOL);
		const groqAfter = afterDisable.filter((m) => m.providerId === "groq");
		expect(groqAfter.find((m) => m.id === targetId)).toBeUndefined();
		expect(groqAfter.find((m) => m.id === otherGroq?.id)).toBeDefined();

		const overrides = await listAdminOverrides(db, SCHOOL);
		expect(overrides.find((r) => r.providerId === "groq" && r.modelId === targetId)).toBeDefined();

		await enableModelOrProvider(db, SCHOOL, "groq", targetId);
		const afterReenable = await getAvailableModelsForUser(db, {}, USER_ID, SCHOOL);
		expect(afterReenable.find((m) => m.id === targetId)).toBeDefined();

		await cleanup();
	});

	it("user credential bypasses provider-level admin denylist", async () => {
		const db = getAppDb();
		await seedPersonalCredential();

		const before = await getAvailableModelsForUser(db, {}, USER_ID, SCHOOL);
		const groqBefore = before.filter((m) => m.providerId === "groq");
		expect(groqBefore.length).toBeGreaterThan(0);

		await disableModelOrProvider(db, SCHOOL, "groq", null, 17, "down for maintenance");

		const after = await getAvailableModelsForUser(db, {}, USER_ID, SCHOOL);
		const groqAfter = after.filter((m) => m.providerId === "groq");
		expect(groqAfter.length).toBeGreaterThan(0);

		await cleanup();
	});

	it("model-selector holder surfaces empty list when no credentials", async () => {
		class AvailableModelsHolderStub {
			models: unknown[];
			constructor(models: unknown[] = [], _hiddenIds: string[] = []) {
				this.models = models;
			}
		}
		const db = getAppDb();

		const models = await getAvailableModelsForUser(db, {}, USER_ID, SCHOOL);
		const holder = new AvailableModelsHolderStub(models, []);

		expect(holder.models).toHaveLength(0);

		await cleanup();
	});

	it("BUILTIN_MODELS catalog is the source for the denylist key match", () => {
		const groqIds = Object.values(BUILTIN_MODELS)
			.filter((m) => m.providerId === "groq")
			.map((m) => m.id);
		expect(groqIds).toContain("groq/llama-3.3-70b-versatile");
	});
});
