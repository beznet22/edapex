import { describe, expect, it, beforeEach, vi } from "vitest";

// Mock audit-log so we don't write to the real filesystem.
vi.mock("$lib/server/audit-log", () => ({
	log: vi.fn(async () => {}),
	readRecent: vi.fn(async () => [])
}));

// Stub getDiscoveredModelsForUser so the test doesn't try to hit live
// /models endpoints. We inject a known list of BUILTIN_MODELS for groq.
vi.mock("$lib/server/mastra/provider/discovery", () => ({
	getDiscoveredModelsForUser: vi.fn(async () => [])
}));

// Mock the Mastra visibility + credentials helpers so user-credential and
// per-user-hidden lookups return empty arrays (no user state to manage).
vi.mock("$lib/server/mastra/provider/visibility", () => ({
	getHiddenModelIdsForUser: vi.fn(async () => new Set<string>())
}));

import { eq } from "drizzle-orm";
import { getAppDb } from "$lib/server/mastra/storage/libsql/app-db";
import { adminModelOverrides, userCredentials } from "$lib/server/mastra/storage/libsql/app-db.schema";
import { disableModelOrProvider, enableModelOrProvider, listAdminOverrides } from "$lib/server/mastra/provider/admin-model-overrides";
import { getAvailableModelsForUser } from "$lib/server/mastra/provider/availability";
import { BUILTIN_MODELS } from "$lib/provider/catalog";

const SCHOOL = 99996;
const USER_ID = 1;

async function cleanup(): Promise<void> {
	const db = getAppDb();
	await db.delete(adminModelOverrides).where(eq(adminModelOverrides.schoolId, SCHOOL));
	await db
		.delete(userCredentials)
		.where(eq(userCredentials.userId, USER_ID));
}

describe("admin disables groq/llama-3.3-70b → next availableModels excludes it", () => {
	beforeEach(async () => {
		await cleanup();
	});

	it("disabling the specific model filters it from availableModels", async () => {
		const db = getAppDb();

		// Seed a user_credentials row for groq so the availability loop
		// actually has a provider to iterate. With discoveredModels=null,
		// the availability code falls back to BUILTIN_MODELS for groq.
		await db.insert(userCredentials).values({
			userId: USER_ID,
			providerId: "groq",
			credentialType: "env",
			priority: 1,
			enabled: 1
		});

		// Confirm the baseline: groq models appear before any disable.
		const beforeDisable = await getAvailableModelsForUser(db, {}, USER_ID, SCHOOL);
		const groqBefore = beforeDisable.filter((m) => m.providerId === "groq");
		expect(groqBefore.length).toBeGreaterThan(0);
		const targetId = "groq/llama-3.3-70b-versatile";
		expect(groqBefore.find((m) => m.id === targetId)).toBeDefined();
		// Sanity: at least one OTHER groq model exists so the test can prove
		// the disable is specific, not whole-provider.
		const otherGroq = groqBefore.find((m) => m.id !== targetId);
		expect(otherGroq).toBeDefined();

		// Admin disables the specific model.
		await disableModelOrProvider(db, SCHOOL, "groq", targetId, 17, "cost limit");

		// Next request: target model is gone, other groq models survive.
		const afterDisable = await getAvailableModelsForUser(db, {}, USER_ID, SCHOOL);
		const groqAfter = afterDisable.filter((m) => m.providerId === "groq");
		expect(groqAfter.find((m) => m.id === targetId)).toBeUndefined();
		expect(groqAfter.find((m) => m.id === otherGroq?.id)).toBeDefined();

		// And listAdminOverrides confirms the row is persisted.
		const overrides = await listAdminOverrides(db, SCHOOL);
		expect(overrides.find((r) => r.providerId === "groq" && r.modelId === targetId)).toBeDefined();

		// Re-enable: target model returns.
		await enableModelOrProvider(db, SCHOOL, "groq", targetId);
		const afterReenable = await getAvailableModelsForUser(db, {}, USER_ID, SCHOOL);
		expect(
			afterReenable.find((m) => m.id === targetId)
		).toBeDefined();

		await cleanup();
	});

	it("disabling the entire groq provider filters ALL groq models", async () => {
		const db = getAppDb();
		await db.insert(userCredentials).values({
			userId: USER_ID,
			providerId: "groq",
			credentialType: "env",
			priority: 1,
			enabled: 1
		});

		const before = await getAvailableModelsForUser(db, {}, USER_ID, SCHOOL);
		const groqBefore = before.filter((m) => m.providerId === "groq");
		expect(groqBefore.length).toBeGreaterThan(0);

		await disableModelOrProvider(db, SCHOOL, "groq", null, 17, "down for maintenance");

		const after = await getAvailableModelsForUser(db, {}, USER_ID, SCHOOL);
		const groqAfter = after.filter((m) => m.providerId === "groq");
		expect(groqAfter).toHaveLength(0);

		await cleanup();
	});

	it("model-selector holder surfaces the post-denylist list", async () => {
		// Lazy import so the holder's class state initializes in this test.
		const { AvailableModelsHolder } = await import("$lib/context/sync.svelte");
		const db = getAppDb();
		await db.insert(userCredentials).values({
			userId: USER_ID,
			providerId: "groq",
			credentialType: "env",
			priority: 1,
			enabled: 1
		});
		await disableModelOrProvider(db, SCHOOL, "groq", null, 17, null);

		const models = await getAvailableModelsForUser(db, {}, USER_ID, SCHOOL);
		const holder = new AvailableModelsHolder(models, []);

		// The model-selector iterates `holder.models` directly — assert that
		// none of them is a groq model.
		expect(holder.models.every((m) => m.providerId !== "groq")).toBe(true);

		await cleanup();
	});

	it("BUILTIN_MODELS catalog is the source for the denylist key match", () => {
		// Sanity: the model id format matches what admin_model_overrides stores.
		// (Defends against a future refactor that splits id into providerId+modelId
		// fields — the denylist would need to follow.)
		const groqIds = Object.values(BUILTIN_MODELS)
			.filter((m) => m.providerId === "groq")
			.map((m) => m.id);
		expect(groqIds).toContain("groq/llama-3.3-70b-versatile");
	});
});
